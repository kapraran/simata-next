# Revamp: implementation plan

Covers the playful UI revamp and the Train selection change agreed on 2026-11-07.
Mockup: `docs/mockups/logo-revamp.html` (artifact https://claude.ai/artifact/NRZWtzUfUX6oVxTTSHhEFf).
Requirements: `docs/REQUIREMENTS.md` ("Look and feel" and "Question selection (Train)").

Logic first, because it is testable on its own and changes what Home shows. Then the theme, which every screen picks up at once, then the screens one at a time.

---

## 1. Train selection (packages/core)

**State (`fold.ts`)**: add `rightStreak` to `QState`: correct and not guessed answers in a row at the end. Then `confident = rightStreak >= 2`. `seen` already counts views.

**New `pickNext` (`session.ts`)**: a pure function that returns the next question id.
- Input: questions, progress, flags, the run so far (`{id, correct, guessed}[]`, oldest first), and an rng.
- Steps, in order:
  1. **Relearn.** Look for a question that was answered wrong or guessed in this run, at least 8 questions ago, and hasn't been answered right since. If there is one, pick it. A question that was relearned and then answered right comes back once more about 30 questions later.
  2. **Otherwise, the lowest effective views.** Effective views = `seen − 2·[flag hard] − min(wrongStreak, 2)`. Leave out Easy, disabled, and the last 10 questions shown. Break ties at random.
- Misses from earlier days rank higher through `wrongStreak`, so they don't need their own queue.

**Remove**:
- `newBudget` and `newSeenBetween` from Train.
- The `"train"` and `"sweep"` cases in `buildSession`.
- Keep `"sweep"` in the `Mode` type so old events still parse.
- Keep `weak`, `category` and `exam` as they are.
- The FSRS memory estimate keeps updating on every answer, but now only feeds the pass chance, the Weak list and Stats.

**Tests** (in `learning.test.ts` / `simulation.test.ts`):
- Answering all 825 right in one sitting shows every question once before any question is shown twice.
- A miss returns after exactly 8 questions, and once more about 30 later.
- Easy never comes up.
- Nothing repeats within 10.
- Hard comes up more often than Next over a long run.
- Replace the existing "daily load bounded" test, since it asserts the old cap.

## 2. Settings and the quiz loop (apps/web)

- **`settings.ts` / `Settings.tsx`:** remove `newPerDay`, `dailyGoal` and `sessionSize`. `parseSettings` already ignores unknown keys, so stored settings stay valid. Only "auto-advance" and Sync are left.
- **`Quiz.tsx`:**
  - Replace `nextBatch` and the queue with `pickNext`, called once per answer, which keeps the run endless.
  - Remove `RETRY_GAP`, since relearning now happens in core.
  - The `"extra"` badge and the "Reviews done" toast no longer apply, so they go.
  - `MODES` becomes `train`, `weak`, plus whichever new modes we keep.
- **Strip:** remove the goal bar and the `n/goal` label. What stays is Stop, the tally and the streak.
- **Remove the "Pick an answer" hint.**
- **Run summary:** remove the goal badge.
- **Home:**
  - Stats become Answered today, Never seen, Confident N/total, Weak spots.
  - Train has no count and is never disabled while anything is left.
  - Remove the Sweep button.

## 3. Theme (one change, every screen)

- Add `apps/web/src/theme.ts` with `createTheme`:
  - Colour scale: road-sign blue `#1E5BD8` as the main colour, plus navy, red and yellow.
  - Radius: md 14, lg 18.
  - Fonts: Fredoka for headings and numbers, Manrope for body text.
  - Default props and `classNames` for `Button`, `Paper`, `Badge` and `ActionIcon`.
- Add `apps/web/src/theme.css` with the sticker look:
  - 2.5 px navy border and a hard `0 4px 0` navy shadow.
  - Buttons move down when pressed.
  - Dark-mode tokens under `[data-mantine-color-scheme="dark"]`: background `#0A1430`, cards `#13224A`.
- **Fonts:** self-host them with `@fontsource/fredoka` and `@fontsource/manrope` rather than Google Fonts, so the installed app works offline. Manrope has Greek; Fredoka is only used for Latin text and digits.
- **Motion:** pop-in, bounce, shake and stamp keyframes, all off under `prefers-reduced-motion`.

## 4. Branding

- Add a `Logo` component: the sign trio as inline SVG next to the "Simata" wordmark with the yellow swoosh. It replaces the steering wheel in the `App.tsx` header.
- Use a blue app bar on Home. Inner pages get a lighter version of it.
- Icons:
  - New `favicon.svg` (the sign trio).
  - `icon-192`, `icon-512` and `apple-touch-icon` cut from `Simata Road Safety App Icon.png`.
  - `icon-maskable-512` with about 10% safe padding on blue.
- In the `vite.config.ts` manifest, set `theme_color` to `#1E5BD8` and `background_color` to `#EEF4FF`.

## 5. Screens

- **Home:**
  - A `SpeedSignMeter` component (an SVG ring) replaces `RingProgress`.
  - A `SignStat` tile with its own sign for each stat.
  - The big Train button.
  - A 2×2 grid of mode tiles.
  - The hero shows only "Ready to roll?".
- **QuestionCard:**
  - The card becomes a sticker; answers become pills with A/B/C badges.
  - Right answers bounce green, wrong ones shake, the correct answer stays lit.
  - Sorting shows a HARD / NEXT / EASY rubber stamp, the streak chip turns yellow from 5 in a row, and the toast is navy with a yellow edge.
  - The layout rules stay: one 32 px strip, the picture slot uses `clamp(...)`, the sort bar is fixed, and answering doesn't resize anything.
- **Exam:**
  - A traffic-light timer.
  - The result is a big sticker: a green check for a pass, a red stop sign for a fail.
  - Missed questions as stickers.
  - A "Drill the misses" button.
- **Stats:** chart colours from the new palette; the restyled cards come from the theme.
- **Settings:** restyled by the theme alone.

## 6. New modes (waiting on the user's pick)

The mockup shows **By topic** and **Blitz · 60s**.
- By topic is cheap: `buildSession` already has `category`. It needs a picker sheet and a `/quiz/category/:cat` route.
- Blitz needs a 60 s timer, a score screen and a stored best score.
- Other options offered: Signs only, Confidence sweep, My notes.

Build only the ones the user confirms.

## 7. Checks

- Run `npm test`, `npm run typecheck` and `npm run lint`.
- In the browser at 375×667 and 375×812, light and dark:
  - Home fits without scrolling.
  - The quiz never scrolls the page.
  - The card's height is the same before and after answering (measure it with JS).
  - Text contrast is at least 4.5:1, and yellow is never used for text.
- Do the whole bank in one day on a fresh profile: Never seen goes down to 0, and nothing caps it.

## Order

1 → 2 → 3 → 4 → 5 → 6, then 7. Steps 1–2 (logic) and 3–4 (theme and branding) touch different files and could run side by side. Step 5 needs both.
