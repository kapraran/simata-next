# Simata v2: plan

A personal trainer for the Greek driving-licence theory exam (category B). It works on phone and PC, keeps working offline, runs on Cloudflare (Workers + D1 + R2), and runs fully locally with `docker compose up`. It does not make you grind 825 questions over and over. It finds the ones you don't know, drills those, and tells you how likely you are to pass today.

This replaces `docs/PLAN.md` (the earlier draft). That draft is solid, and I kept a lot of it. §12 lists where this plan differs and why.

---

## 0. TL;DR

- **Images: mostly recovered.** The original image URLs are dead (drivepoint.gr returns 404, checked 2026-10-17). But the old `simata` R2 bucket still has **372 of the 414 images, each verified against its SHA-256**, and the local cache adds 1 more. **784 of 825 questions are usable.** 41 images are lost (27 signs, 8 junctions, 6 others). M1 is now a small import job, not a rescue (§7).
- **Old Cloudflare resources are off-limits.** Per your call, v2 never writes to the old `simata` R2 bucket, D1 database or Pages project, and never changes or deletes them. v2 gets new resources. The old public `simata-cloud.pages.dev` is yours to take down (§7.1).
- **The core idea:** you see each question once, quickly. Questions you answer right on the first try leave the rotation for weeks. Spaced repetition (FSRS) then schedules only what you are actually weak on.
- **The number that matters:** the exam is reported as 30 questions in 35 minutes with at most **1 mistake** allowed (unofficial sources, verify). That bar is brutal, so the app shows a live **pass chance**, simulated from your own per-question memory model. Most of the gamification hangs off that number.
- **Architecture:** local-first. The app holds the question bank and an append-only answer log in IndexedDB, and all scheduling runs in the browser from a shared pure-TS `core` package. The server is thin: it stores events, syncs devices, and serves media. This one choice gives you offline training, PC/phone sync, and almost no backend to port between Cloudflare and Docker.
- **Stack:** pnpm monorepo, TypeScript, Hono, Drizzle (SQLite dialect: D1 in the cloud, a SQLite file locally), React + Vite, Mantine + Tabler Icons, Dexie, ts-fsrs, vite-plugin-pwa, Vitest + Playwright, Biome.

---

## 1. What you already have

### simata-tmp (Oct 2022, 2 commits). The one that actually worked.
Express + JSON files + a small React/Vite client. Used for one evening: 246 answers on 173 questions, 90% accuracy, 2022-10-26.

| Piece | What it does | State |
| --- | --- | --- |
| `inbrowser.js` / `saveq.html` | Bookmarklet that scrapes questions off drivepoint.gr pages into the clipboard, plus a paste page that POSTs them to the server | Worked. This is how the 825 questions were collected. Unusable now: the site changed. |
| `questions.json` | **825 questions, 25 categories, every one with exactly 1 correct option out of 2 or 3, 414 with images** | The real asset. Stable ids like `ΟΡΓΑΝΑ 16`. |
| `stats.json` | Per-question stats: counts, total duration, answer history, `hard`/`easy` tags | 246 answers in it |
| `db.js` | Picks questions: never answered correctly, then last answered wrong, then tagged hard, shuffled, in batches of 30 | Partly broken: `queueSourceArray()` is called without `n`, so the fallbacks never run. `getQuestionsWithWorstSuccess` is a copy of the duration sort. Tags can be added but never removed. |
| `server.js` | `/next`, `/answer`, `/stats`, image caching into `static/` | Rewrites all of `stats.json` on every answer. Has dead code. |
| React client | Quiz page: shuffled options, auto-advance on correct, stops on wrong to show the answer, EASY/HARD toggles, records time per question. Home page dumps the stats JSON. | Mobile-ish (sizes in `vh` units), dark |

### simata-cloud (Nov 2022, 30 commits). A cloud rewrite that stopped halfway.
Cloudflare Pages + Functions + R2, Firebase Google login, Fauna DB.

| Piece | State |
| --- | --- |
| R2 question blob (deflate-compressed, minified) | Works. `questions/all.json` in R2 is identical to the local `questions.json` (all 825 checked). |
| `/images/[hash]`: fetches an image from drivepoint on first request and caches it in R2 under `images/<sha256(url)>` | Worked in 2022, and it cached **372 of the 414 images**. That cache is now the only copy of most of them (§7). |
| Pages deployment `simata-cloud.pages.dev` | **Still live and public.** `/api/questions` serves the full bank with answers without auth; `/images/*` serves the images. |
| Firebase auth, token verified in Functions | Works |
| `/api/answers` | Only creates an empty stats doc. It never records the answer. |
| `/api/questions/next` | 20 random questions. The adaptive logic from simata-tmp was never ported. |
| Fauna DB | **Dead dependency.** Fauna shut its service down in 2025. |
| UI | Login screen, then a question with a "Next" button. The correct answer is sent to the client and visibly marked. `minWidth: 800px`, so it doesn't fit a phone. Home, Quiz and Stats pages are stubs. |

### simata-next
Only `docs/PLAN.md` from the other bot. No code, no git repo.

---

## 2. What you were going for

Reconstructed from the code, the commit history and your brief:

1. **Endless adaptive quiz.** Your words in the cloud README: questions "based on the user's level of knowledge". The tmp version already put never-right and last-wrong questions first.
2. **Don't waste time on what you know.** EASY/HARD self-tags, and auto-advance when you answer correctly.
3. **Learn from mistakes.** On a wrong answer it stops and shows the right one.
4. **Measure hesitation.** It recorded time per answer. A correct but slow answer is a weak spot.
5. **Avoid memorising answer positions.** Options are shuffled every time.
6. **Own the content.** You scraped the questions and cached the images yourself instead of hotlinking. (That R2 cache is what saved 372 images after the source site removed them.)
7. **Train anywhere, on any device.** The move to Cloudflare, Google login and a per-user DB.
8. **Notes per question.** The Fauna schema had a `notes` field that the UI never used.
9. New in your brief: **gamification**, **a ready-made UI kit with a consistent icon set**, and **Cloudflare plus a fully local Docker setup behind clean abstractions**.

---

## 3. How the trainer works

### 3.1 The loop

```
 First time (Sweep)            Daily (Train)                       Checkpoint (Mock exam)
 ──────────────────            ─────────────                       ──────────────────────
 every unseen question once,   due reviews, plus a few new         30 questions, 35 min,
 fast. Right + quick + not     questions until the bank is         no feedback until the end,
 guessed: gone for weeks.  ─▶  swept. Ends when nothing is   ─▶    pass/fail by the real rule.
 Wrong/slow: learning queue.   due. A short session is fine.       Unlocks at pass chance > 50%.
```

- **Sweep** is the answer to "I don't want to go through all 800+". With a 29-of-30 pass bar you can't skip questions you have never seen. But seeing each one once takes about 5–10 seconds, roughly 1–1.5 hours for the whole bank, in chunks by category. Going by your 2022 accuracy, maybe 150–250 questions end up needing real work. After the sweep, you only ever see those plus occasional spot-checks.
- **Train** is the default button: today's due reviews, plus new questions while unswept ones remain. It stops when nothing is due, and never pads the session with questions you know.
- **Weak spots**: only questions you got wrong recently, answered slowly, flagged hard, or marked "guessed".
- **Category drill**: pick a category from the category map (§5).
- **Mock exam**: a full simulation. Its answers still count toward scheduling: they are genuine recall attempts, the feedback just comes later.

### 3.2 Scheduling: FSRS via `ts-fsrs`

I'd use FSRS from the start rather than hand-rolling Leitner boxes. `ts-fsrs` is a maintained library, so it is less code than writing boxes. And for every question it gives **retrievability**: the probability you'd answer it right today. That is exactly the input the pass-chance meter needs.

How an answer becomes an FSRS grade (this mapping lives in `core`, is tunable, and is unit-tested):

| Outcome | Grade |
| --- | --- |
| Wrong | Again |
| Right, but you tapped "I guessed" | Hard |
| Right, slower than your own 75th-percentile time for questions of similar length | Hard |
| Right, normal speed | Good |
| Right, first time ever seen, fast | Easy (this is what lets the sweep skip questions) |

- **Guessing matters here:** 293 questions have only 2 options, so blind luck is 50% right. After a correct answer there's a ~1 s window with an **"I guessed"** chip before it auto-advances. One tap, and the question stays in rotation.
- Flags: `hard` lowers the target retention for that question (you see it more often). `easy` retires it.
- **Exam date** (optional setting): the desired retention is set so that your schedule peaks on exam day, and Home shows "~N min/day to be ready by <date>".

### 3.3 Pass chance

- For each question, p(correct) = R + (1 − R) / numOptions, where R is FSRS retrievability. Unseen questions use your first-sight accuracy as a prior.
- Monte Carlo: about 2,000 simulated exams of 30 questions drawn from the bank. Pass = at most 1 wrong. It runs in the browser in milliseconds.
- Shown as a big percentage on Home, plus a trend line in Stats.
- How the real exam picks questions (uniformly, or per category?) is unverified. The draw is a single function in `core` that can be changed once this is confirmed.

### 3.4 Small things that make it feel right

- Options shuffled every time (kept from v1).
- Auto-advance on correct. On wrong it stops, highlights the right option, and waits.
- Keyboard: `1`–`3` to answer, `Space`/`Enter` to continue, `G` for guessed, `H`/`E` for hard/easy, `N` for a note. Phone: large tap targets, optional swipe to continue.
- A note per question (from the Fauna schema). Shown under the question after you answer.
- Tap an image to view it full screen (the signs are small).

---

## 4. Architecture

### 4.1 Local-first, event-sourced

```
 ┌────────────────────────── Browser (PWA) ──────────────────────────┐
 │  React + Mantine UI                                              │
 │     │ useLiveQuery                                               │
 │  Dexie (IndexedDB): bank cache · answer events · outbox · notes  │
 │     │                                                            │
 │  @simata/core: fold(events) → card states → session · pass% · XP │
 └─────┬─────────────────────────────────────────────────────────────┘
       │ POST /api/sync  (push outbox, pull events after cursor)
       │ GET  /api/bank/:version  · GET /api/media/:key
 ┌─────▼──────────── Hono app: createApp(ports) ───────────────────┐
 │  ports: EventStore · KvStore · BlobStore · Identity · Clock     │
 └─────┬───────────────────────────────┬───────────────────────────┘
   Cloudflare Worker               Node (Docker)
   D1 · R2 · Access JWT            SQLite file · /data/media volume · "local" user
```

- **Answers are an append-only log.** Each event `{id: ULID, questionId, optionText, correct, durationMs, guessed, mode, at, deviceId}` is written to IndexedDB first and synced later.
- **All state is derived.** FSRS card states, streak, achievements and stats are a pure fold over events in `core`. Nothing is stored as a counter, so nothing can drift. This also makes importing your 2022 answers trivial: they become events with their original timestamps, and FSRS correctly treats them as 4-year-old memories.
- **Sync is idempotent.** The server does `INSERT … ON CONFLICT DO NOTHING` on the ULID and returns everything after the client's cursor. Phone and PC converge. No conflict resolution needed: events never change. Settings and notes are last-write-wins records with `updatedAt`.
- **Correct answers ship to the client.** The earlier draft made "correct answers never leave the server" a goal. For a personal trainer you can only cheat yourself, and keeping that rule would rule out offline. Offline wins.

### 4.2 Ports (the abstraction you asked for)

| Port | Cloudflare | Local / Docker |
| --- | --- | --- |
| `EventStore`, `KvStore` (settings, notes) | Drizzle on D1 | Drizzle on better-sqlite3 (same schema and migrations) |
| `BlobStore` (bank JSON, images) | R2 binding | folder on a volume |
| `Identity` | Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`, verified) → email | fixed `local` user, or a header set in `.env` |
| `Clock` | `Date.now` | `Date.now`; fake clock in tests |

The same **contract test suite** runs against both adapter sets (SQLite directly, D1 through Miniflare). If both pass, the abstraction is real.

Why the content lives in R2 / the blob store rather than the repo or the build: the questions and images are third-party material. Keeping them out of git and out of the bundle means the code repo can be public while the content stays private. It also gives R2 a real job.

---

## 5. Gamification

Built around the pass chance, not arbitrary points. Every element can be hidden with a "focus mode" toggle.

| Element | Mechanic |
| --- | --- |
| **Pass chance** | Main meter on Home. Visibly moves after a good session. |
| **Category map** | 25 tiles, one per category, coloured by average retrievability (grey → red → amber → green → gold). "Conquer" a category by getting it all to green. Tap a tile to drill it. |
| **Sign album** ("σήματα") | The 196 ΣΗΜΑΝΣΗ images that survived as a sticker book. Each sign is greyed out until its question is mastered (stability above 21 days). A collection is the most fun way through the biggest category. |
| **Streak** | Days with at least one completed session. One automatic "freeze" per week so a single missed day doesn't reset it. |
| **Daily goal ring** | Defaults to "finish today's due reviews". With an exam date set, it becomes the minutes per day needed. |
| **Combo** | In-session counter of correct answers in a row, with a small effect at 10/20/30. A 30-combo is "a perfect exam". |
| **Mock exam** | Unlocks at pass chance > 50%. Best score and pass/fail history. "3 passes in a row" is the real finish line. |
| **Achievements** (~10) | Sweep complete · first category conquered · all categories green · sign album complete · 7- and 30-day streak · 30-combo · first mock pass · 3 mock passes in a row · 100 "hard" questions fixed · comeback (fixing something you'd missed 3+ times) |

No XP or levels. They would duplicate the meters above with a less honest number. Easy to add later if you miss them, since everything is derived from events.

---

## 6. UI

- **Mantine** (latest stable at scaffold time) + **Tabler Icons** (`@tabler/icons-react`). Mantine ships everything this needs: `AppShell`, `RingProgress`, `Progress`, notifications, modals, `@mantine/charts`, dark mode, touch-friendly sizes. Tabler is the icon set designed to pair with it, so the icons stay consistent.
- **Layout:** `AppShell`. Phone: bottom nav with 4 icons (Home, Train, Map, Stats). Desktop: side nav, quiz card centred at reading width.
- **Pages:** Home (pass %, ring, streak, Train button, other modes), Quiz, Map (categories + sign album), Stats (accuracy and pass % over time, slowest questions, most-missed questions), Settings (exam date, new questions per day, focus mode, export/import JSON backup).
- Dark by default, follows the system setting.
- UI language: English with strings in one file, so switching to Greek later is a file swap. The content is Greek either way.

---

## 7. Content and the Cloudflare account

### 7.0 What's on the account (read-only checks, 2026-10-17)

| Resource | State | Plan |
| --- | --- | --- |
| R2 bucket `simata` (EEUR, created 2022-11-11) | 374 objects, 5.33 MB: `questions/all.json`, `questions/all_min.bin`, 372 images under `images/<sha256(url)>` | **Leave alone.** v2 gets its own new bucket. It is only the source for a one-time, read-only copy of the images (§7.3 step 1), and only with your OK. |
| D1 `simata` (created 2023-08-03) | Empty: 0 tables, 0 bytes | **Leave alone.** v2 gets a new D1 database. |
| Pages project `simata-cloud` | Git-connected, last deployed ~3 years ago, live at `simata-cloud.pages.dev` | **Leave alone.** Your call whether to take it down (§7.1). v2 is a single Worker. |
| Zone `kapraran.dev` | On the account (used by the `kapraran-website` Pages project) | Can host v2 at e.g. `simata.kapraran.dev`. |
| Cloudflare Access / Zero Trust | Can't check: the wrangler OAuth token has no Access scope | Set up a Zero Trust team in the dashboard before M8. |
| Wrangler | 4.74.0 via the npx cache (4.151.1 available), not installed globally | Pin wrangler as a devDependency in the repo. |

### 7.1 The old public deployment (your call)

`simata-cloud.pages.dev` is public. `/api/questions` returns all 825 questions with the correct answers (508 KB, no auth), and `/images/<hash>` serves the cached images. That is redistributing third-party content. Options, in order of preference:

1. Delete the Pages project, or put an Access policy on it, in the dashboard. Deleting it does not touch the R2 bucket. I will not do this for you.
2. Remove the Fauna/Firebase secrets from the project and the Firebase project itself, since neither is used by v2.
3. Archive the `simata-cloud` GitHub repo once v2 reaches M4.

### 7.2 Image coverage

The filename hash on each drivepoint image is the SHA-256 of its content, so every recovered image was checked byte for byte.

| Source | Images |
| --- | --- |
| R2 `images/*`, hash verified | 372 |
| `simata-tmp/static/` and not in R2 | 1 |
| **Lost** | **41**: ΣΗΜΑΝΣΗ 27, ΔΙΑΣΤΑΥΡΩΣΕΙΣ 8, ΠΡΟΣΠΕΡΑΣΗ 3, ΣΥΝΥΠΑΡΞΗ 1, ΑΛΚΟΟΛ 1, ΑΥΤΟΚΙΝΗΤΟΔΡΟΜΟΣ 1 |
| **Usable questions** | **784 / 825** (all 411 text-only questions + 373 with an image) |

A few of the 41 may make sense without their picture (e.g. ΑΛΚΟΟΛ 6, about the legal blood-alcohol limit). The importer flags these for a manual look rather than guessing.

### 7.3 Import (M1)

1. **Export once.** `tools/import pull-r2` copies `questions/all.json` and the 372 images out of the `simata` bucket into a local, git-ignored `content/` folder, verifying each SHA-256. This becomes the canonical source. Neither drivepoint nor the old bucket layout matters after that.
2. Add the 1 image from `simata-tmp/static/`.
3. **Validate**: exactly 1 correct option, an image present whenever the text refers to one ("πινακίδα", "εικόνα", "σε αυτήν την περίπτωση"…). Deduplicate images by content hash.
4. **Build** `bank.<hash>.json` + `media/<sha256>.jpg`, and seed either blob store: the local volume, or the new v2 R2 bucket.
5. The 41 questions without images ship as `disabled`. The importer prints the list.
6. **Later, optional:** fill in the 41 from the **official ministry question bank** (PDFs with images from the Ministry of Infrastructure & Transport) by fuzzy-matching the Greek text. This is no longer a blocker, so it moves out of M1.

Personal use only. Don't publish the content.

---

## 8. Data model

**Bank** (`bank.<hash>.json` in the blob store, cached by the service worker):
```ts
{ version, categories: string[], questions: [{ id, category, text, image?: key,
  options: [{ text, correct }], disabled?: true }] }
```

**D1 / SQLite:**
```
events     id TEXT PK (ULID), user_id, question_id, option_text, correct INT,
           duration_ms, guessed INT, mode, at INT, device_id, server_seq INT (autoinc, sync cursor)
kv         user_id, key, value JSON, updated_at   -- settings, notes:<qid>, flags:<qid>
```

That's the whole server schema. `user_id` is there from day one, so you can add a friend later with no migration.

---

## 9. Repo layout

```
simata-next/
  packages/
    core/          types, grading, fsrs wrapper, fold, session builder, pass-chance sim,
                   gamification rules. Pure, no I/O. Most of the tests live here.
  apps/
    api/           Hono createApp(ports); adapters/{d1,r2,sqlite,fs,access}; entry/{worker,node}.ts
    web/           React PWA (Mantine, Dexie, sync client)
  tools/import/    rebuild bank + media from questions.json, R2 dump, official PDFs; seed both targets
  docker/          api.Dockerfile (multi-stage: builds web, Hono serves it)
  docker-compose.yml          api on :3001 (SQLite + media volumes), web dev on :5173
  docker-compose.prod.yml     single container serving web + api
  wrangler.jsonc              Worker + static assets + D1 + R2 bindings
```

Three packages instead of five. DB and storage adapters live in `api`, because only `api` uses them.

---

## 10. Local and cloud

- **Local:** `docker compose up` gives Vite on :5173 (proxying `/api`) and the Node API on :3001. Migrations run on start, and the seed runs if the blob store is empty. Your phone on the same Wi-Fi can open `http://<pc-ip>:5173`.
- **Parity check:** an optional compose profile runs the Worker build under `wrangler dev` (local D1/R2) in a container, so the Cloudflare path can be tested without deploying.
- **Cloud:** one Worker serving the API plus the built web app (Workers Static Assets). Bindings point at new v2 resources: D1 `DB` (new database) and R2 `MEDIA` (new bucket); the old ones are not used. Migrations via `wrangler d1 migrations apply` from the same SQL files. Custom domain on the `kapraran.dev` zone (e.g. `simata.kapraran.dev`) instead of `*.workers.dev`, so the Access policy covers a single hostname. **Cloudflare Access** (free tier) in front, with Google login, so the app has no auth code of its own.
- **Backup:** Settings → export/import a JSON file of all events. A scheduled Worker writes a weekly dump to R2.

---

## 11. Milestones

| # | Milestone | Done when |
| --- | --- | --- |
| — | Old `simata-cloud.pages.dev` taken down by you (§7.1) | `/api/questions` no longer public |
| M0 | Scaffold: pnpm workspace, TS, Biome, Vitest, wrangler pinned, compose with `/api/health` and an empty Mantine shell | `docker compose up` serves both, CI green |
| M1 | Import CLI (§7.3): pull bank + 372 images from R2 into `content/` with hash checks, validate, build bank, seed local | Report shows 784 enabled / 41 disabled; `bank.json` + media seeded into the local volume |
| M2 | `core`: fold, grading, FSRS, session builder, pass-chance sim, 2022 stats import as events | Tests green, including a simulated 30-day learner. The sweep retires ≥60% of questions for a 90%-accurate learner, and the daily load stays bounded |
| M3 | `api`: sync, bank, media, kv; SQLite + D1 adapters; contract tests on both | `/api/sync` is idempotent under replays |
| M4 | Web MVP: Sweep + Train + quiz card, Dexie, sync, notes, flags, "I guessed" | You can train on the phone over LAN and see the same progress on PC |
| M5 | Mock exam, Stats, pass-chance meter | Mock exam matches the real format, pass % moves after training |
| M6 | Gamification: map, sign album, streak, ring, combo, achievements, focus mode | Rules unit-tested, Playwright run at phone width |
| M7 | PWA + offline: installable, airplane-mode session syncs when back online | Verified on a real phone |
| M8 | Cloudflare deploy: Worker on a new v2 D1 + R2, custom domain, Zero Trust team + Access policy, weekly R2 backup | Same progress from phone and PC on the live URL; unauthenticated requests are blocked |
| M9 (opt.) | "Why?" explanations: one-off batch with the Claude API, generated in Greek, stored in the bank, marked unreviewed until you OK them | Explanation shown after a wrong answer |

M4 is the first point where it's useful day to day. Everything after that is improvement.

---

## 12. Differences from the earlier draft (`PLAN.md`)

| Topic | Earlier draft | This plan | Why |
| --- | --- | --- | --- |
| Where logic runs | Server computes sessions and correctness | Browser, from a shared `core` | Offline on the metro and instant feedback; server shrinks to sync + media |
| Hiding answers | A goal | Dropped | Single user, so it only protects you from yourself, and it rules out offline |
| Offline | Non-goal | Core feature | "Train anywhere" |
| Scheduler | Leitner boxes, FSRS later | FSRS (ts-fsrs) now | Less code, and gives retrievability for pass chance |
| Skipping known questions | Mastered after 5 correct answers over ~a month | Sweep: right + fast + not guessed on first sight → out for weeks | That's what actually spares you the 800+ |
| Guessing | Not handled | "I guessed" chip, odds-adjusted p(correct) | 293 two-option questions = 50% luck |
| Gamification | XP, levels, generic badges | Pass chance, category map, sign album, streak, combo, mock exam | Tied to the real goal, harder to game |
| Images | Importer re-downloads URLs | URLs are dead; import from the old R2 cache (372 verified) + local cache | Checked: 404 at the source, 373/414 recovered |
| Cloud resources | New Worker, D1, R2 | New v2 Worker, D1 and R2; old ones untouched | Your call: nothing old is modified |
| Packages | core, db, storage, api, web | core, api, web | Adapters only have one consumer |
| Old stats | Optional, derive a box | Imported as timestamped events | Free with event sourcing, and FSRS decays them correctly |

Kept from the draft: Hono + Drizzle on SQLite, Mantine + Tabler, the ports design, Cloudflare Access instead of login code, a single Worker with static assets, contract tests across adapters, tools/import as a CLI rather than an endpoint, and the milestone-with-verification format.

---

## 13. What I need from you

Everything else has a default above. These change what gets built:

1. **One-time read-only copy** of the 372 images and the question bank out of the old `simata` bucket for M1: OK, or would you rather re-source them another way? Nothing is written to the old bucket either way.
2. **Exam date**, if you have one. It sets the daily load and the retention target.
3. **The exam rule:** confirm 30 questions / 35 min / at most 1 mistake (unofficial sources say so), and whether questions are drawn per category.
4. **Location:** build in `simata/simata-next` (with `git init`), keeping the two old projects as read-only reference?
