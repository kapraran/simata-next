# simata-next

A driving-theory trainer that works on PC and phone, runs on Cloudflare (Workers, D1, R2), and runs fully locally in Docker Compose with the same code. It does not make you grind all 800+ questions: it schedules what you need, and mastered questions fade out. A light gamification layer sits on top.

Working name. Rename freely.

---

## 1. Goals

1. Same UI on phone and PC, installable as a PWA.
2. One codebase, two deployments: Cloudflare (Workers + D1 + R2) and local (`docker compose up --build`). Only the adapters change, never the business logic.
3. Adaptive sessions: due reviews first, a capped number of new questions per day, mastered questions drop out of rotation.
4. Gamification that rewards consistency (XP, streaks, badges, daily goal). It can be turned off.
5. Correct answers never leave the server before an answer is submitted.

Non-goals for v1: public multi-user signup, payments, social features, offline-first sync.

---

## 2. Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Monorepo | pnpm workspaces, TypeScript everywhere | shared types between web and api |
| API | Hono | same app runs on Workers and on Node (Docker) |
| Database | Drizzle ORM, SQLite dialect | D1 *is* SQLite. Local uses a SQLite file. Same schema, same migration SQL |
| Blob storage | `BlobStore` interface: R2 binding (cloud), volume folder (local) | question images |
| Web | React + Vite + TypeScript | |
| UI kit | Mantine (v8 or latest stable at scaffold time, check) | ready components, responsive, dark mode, notifications, good on touch |
| Icons | Tabler Icons (`@tabler/icons-react`) | designed to pair with Mantine, one visual family |
| Server state | TanStack Query | caching, retries, mutation handling |
| PWA | `vite-plugin-pwa` | installable on phone, app shell cached |
| Tests | Vitest (core, api, repositories), Playwright (e2e smoke) | |
| Local orchestration | Docker Compose | per your global rules: dev on :5173 (web) / :3001 (api) |

---

## 3. Repository layout

```
simata-next/
  docs/PLAN.md
  packages/
    core/        pure TypeScript. Types, scheduler, session builder, gamification rules.
                 No I/O, no framework imports. Heavily unit-tested.
    db/          Drizzle schema + generated SQL migrations.
                 Repository interfaces + two adapters: d1.ts and sqlite.ts.
    storage/     BlobStore interface + r2.ts and fs.ts adapters.
  apps/
    api/         createApp(deps) in Hono. Two entrypoints:
                   worker.ts  -> Cloudflare Worker (D1 + R2 bindings from env)
                   node.ts    -> Node server (better-sqlite3 + fs volume)
    web/         React PWA, talks only to /api
  tools/
    import/      scraper snippet, converter to canonical JSON, seed command
  docker/
    api.Dockerfile, web.Dockerfile
  docker-compose.yml
  docker-compose.prod.yml   (optional, static web via nginx)
```

**The key abstraction:** `createApp({ questions, progress, answers, blobs, clock })`. The Hono app only knows interfaces. Each entrypoint wires concrete adapters. `clock` is injected so time-based scheduling is testable.

---

## 4. Data model (canonical)

```
questions      id (text, pk, e.g. "ΟΡΓΑΝΑ 16"), category, text, image_key?, source_id?
options        id (text pk), question_id, position, text, is_correct
               -> is_correct is only read server-side

progress       user_id, question_id (pk pair),
               box (0..5), due_at, seen_count, correct_count, consecutive_wrong,
               flag ('hard' | 'easy' | null), last_answered_at

answers        id, user_id, question_id, option_id, correct, duration_ms,
               mode, created_at
               -> append-only event log. XP, streak and stats are derived from it.

badges         user_id, badge_id, unlocked_at
               -> stored so an unlocked badge never disappears
```

- `user_id` exists from day one, defaulting to `'me'`. Multi-user later needs no schema rewrite.
- Answer submission writes `answers` and updates `progress` in one D1 `batch()` (atomic).
- XP, level, streak and stats are derived, not stored counters, so they can't drift.

---

## 5. Selection engine (`packages/core/scheduler`, `session`)

Leitner-style boxes with an interval ladder. Simple, explainable, and easy to replace with FSRS later behind the same interface.

| Box | Meaning | Next review after a correct answer |
| --- | --- | --- |
| 0 | never seen | (new) |
| 1 | just missed or just learned | 10 minutes (same-session retry) |
| 2 | | 1 day |
| 3 | | 3 days |
| 4 | | 7 days |
| 5 | mastered | 21 days |

Rules:
- Correct: box + 1 (max 5). Wrong: box back to 1, `consecutive_wrong` + 1.
- Flags tune intervals: `hard` halves the interval, `easy` doubles it.
- Mastered (box 5) questions are excluded from random draws entirely. That is what stops you grinding the full bank.

**Session builder** (pure function, deterministic given a seed):
1. Due reviews, ordered by box ascending, then by `consecutive_wrong` descending.
2. Fill with new questions (box 0), capped by `newPerDay` (default 8, configurable).
3. If the due list is short, do not pad with mastered questions. A short session is correct behaviour.
4. Modes:
   - **Quick 10**: default, size 10.
   - **Review all due**: everything due today.
   - **Weak spots**: only questions with `consecutive_wrong > 0` or flag `hard`.
   - **Exam simulation**: N random questions from non-mastered pool, feedback at the end. Whether it updates the schedule is a decision (see §10).

Math check to run as a unit test: with 825 questions and `newPerDay = 8`, a steady-state user sees a bounded number of questions per day, and the due queue does not grow without bound.

---

## 6. API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | liveness for Docker and Workers |
| GET | `/api/session?mode=quick&size=10` | session questions with options, no correct flags |
| POST | `/api/answers` | `{ questionId, optionId, durationMs, mode }` returns `{ correct, correctOptionId, xpGained, box, newBadges }` |
| PUT | `/api/questions/:id/flag` | `{ flag: 'hard' \| 'easy' \| null }` |
| GET | `/api/stats` | coverage, box histogram, accuracy, streak, XP, level, badges, daily goal progress |
| GET | `/api/media/:key` | image from BlobStore, `cache-control` long-lived |

Import is **not** an HTTP endpoint. It is a CLI in `tools/import` that writes SQL or JSON and seeds either target. That removes an admin upload surface from the public API.

The security fix from `simata-cloud` is structural here: `is_correct` is never selected for `/api/session`, and `/api/answers` is the only place correctness is computed.

---

## 7. Gamification (proposal, confirm in §10)

- **XP**: +10 per correct answer. +5 if flagged `hard`. +5 for the first correct answer ever on a question. Wrong answers give 0.
- **Level**: derived from total XP. Simple curve, documented in `core`.
- **Streak**: consecutive local days with at least one answer. Shown on Home.
- **Daily goal**: a ring showing answers today against a target (default 10).
- **Badges** (about 8 to start):
  - First 10 correct in a row
  - 100 answers, 500 answers
  - Category mastered (all questions in one category at box 5 or 4)
  - 7-day streak, 30-day streak
  - 10 correct on `hard`-flagged questions
  - Perfect Quick 10
- **Feedback**: Mantine notifications when XP is gained or a badge unlocks.
- **Off switch**: a setting hides XP, streak and badges and keeps the plain trainer. Some gamification gets in the way of studying, so this matters.

All rules are pure functions in `core/gamification` and unit-tested.

---

## 8. UI

**Pages**
- **Home**: due count, today's daily-goal ring, streak, mode buttons (Quick 10, Review all due, Weak spots, Exam sim).
- **Quiz**: question card, large touch targets for options, immediate right/wrong feedback with the correct option highlighted, flag buttons (hard/easy), next button. Keyboard on PC: `1`-`4` to choose, `Enter` to advance.
- **Stats**: coverage per category, box histogram, accuracy over time.
- **Achievements**: XP, level, badges with unlock dates.

**Layout**
- Mantine `AppShell`. On small screens, a bottom nav with four icons (Tabler). On desktop, a side nav.
- Dark mode by default, following the system setting.
- Mobile-first breakpoints. Question images lazy-loaded and capped to viewport width.
- Interface language: open question, see §10.

---

## 9. Local and cloud parity

**Local (Docker Compose)**
- `api` service: Node entrypoint, SQLite file in a named volume, migrations run on start, seed runs once if the DB is empty.
- `web` service: Vite dev server on :5173, proxying `/api` to :3001. Prod compose serves the built static files via nginx.
- Optional `e2e` profile running Playwright against the running stack.
- `.env.example` documents every variable. No secrets are committed.

**Cloud (Cloudflare)**
- One Worker serving both the API and the built web app via Workers Static Assets, so there is one deploy. Pages is the alternative; decide at M7.
- D1 binding `DB`, R2 binding `MEDIA`. Migrations applied with `wrangler d1 migrations apply` from the same `packages/db` SQL files that the local Node adapter runs.
- Access control: Cloudflare Access (Zero Trust, free for personal use) in front of the deployment. No login code in v1.

**Parity test**: the same repository contract test suite runs against the D1 adapter (via Miniflare or wrangler's local D1) and the SQLite adapter. If both pass the same tests, the abstraction is real.

---

## 10. Migrating the old data (optional)

- `simata-tmp/questions.json`: 825 questions. Ids like `ΟΡΓΑΝΑ 16` are stable and become primary keys. Options map cleanly to `options` rows.
- Images: the importer downloads each `image` URL once into the BlobStore, so the app never hotlinks the third-party site at runtime.
- `simata-tmp/stats.json`: 173 questions have at least one answer. Could seed `progress` from it, deriving box from the last answer result. Optional.
- `simata-cloud`: nothing to migrate. It never recorded answers. Its R2 question blob holds the same content, so the JSON from `simata-tmp` is the source of truth.
- Content and licensing: the questions and images come from a third-party exam site. Keep this for personal use, and don't publish the data.

---

## 11. Milestones

Each milestone ends with verification: tests passing, and the stack running in Docker Compose for anything user-facing.

| # | Milestone | Done when |
| --- | --- | --- |
| M0 | Foundations: pnpm workspace, TS config, lint/format, Docker Compose with a health endpoint and an empty web page | `docker compose up --build` serves web on :5173 and `/api/health` returns ok |
| M1 | `core`: types, scheduler, session builder, gamification rules | Vitest green; steady-state bound test passes for 825 questions |
| M2 | `db` + `storage`: schema, migrations, both adapters, import CLI | Repository contract tests pass on SQLite and D1 (miniflare); 825 questions seeded locally |
| M3 | `api`: endpoints, answers hidden from session, tests with `app.request()` | API tests green; `/api/session` response contains no `is_correct` |
| M4 | `web` MVP: Home, Quiz with feedback and flags, Stats basic | Playwright smoke completes a quiz in the Docker stack |
| M5 | Gamification: XP, streak, daily goal, badges, notifications, off switch | Core rules tested; badges appear in the UI after the right answers |
| M6 | PWA and mobile polish: installable, responsive pass at phone width | Installs on a phone; layout checked with Playwright at mobile viewport |
| M7 | Cloudflare deploy: Worker config, D1 + R2 bindings, migrations, Access | Same app works on the deployed URL from phone and PC |

---

## 12. Decisions to confirm

1. **UI kit**: Mantine + Tabler (recommended here) or shadcn/ui + Tailwind + Lucide?
2. **Interface language**: English, or Greek for the UI as well as the questions?
3. **Auth in v1**: no login, deployed behind Cloudflare Access (recommended), or Better Auth from the start?
4. **Scheduler**: Leitner boxes as described (recommended first), or SM-2 / FSRS right away?
5. **Gamification**: keep the list in §7 as is, or drop/add anything? Should it default to on or off?
6. **Exam simulation**: does it update the schedule, or is it a separate practice mode with no effect on progress?
7. **Old stats**: import the 173 answered questions as starting progress, or start clean?
8. **Location and name**: create the project at `C:\Users\nikos\dev\simata\simata-next` (this folder), and keep `simata-cloud` and `simata-tmp` as reference only?

Once §12 is settled, M0 is the first thing to build.
