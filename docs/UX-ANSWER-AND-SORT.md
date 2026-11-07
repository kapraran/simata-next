# Answer, then sort: mobile UX plan

The quiz screen is mostly used on a phone. After answering, you sort the question with your thumb: hard, easy, or "just move on". This doc keeps all four mockups so any of them can be built later.

Mockups (interactive, press Play on each phone): https://claude.ai/artifact/DyLRv8aDMuH3SEf576emoS

Status: **A is being built first** (2026-11-06). B, C and the run summary are parked here.

---

## Shared rules (every concept)

- **Answer first, sort second.** Sorting is only possible after an answer is revealed. Before that, the card can't be dragged.
- **Questions without an image show no image box.** About 570 of 825 questions have no image. No empty tile or placeholder is shown for them, so the user is not confused into thinking a picture is missing. Only a question whose picture was lost gets the "Picture lost" tile.
- **Categories map onto what the app already stores:**

  | UI | Stored as | Effect today |
  | --- | --- | --- |
  | Hard | `flag: "hard"` | Shown more often |
  | Easy | `flag: "easy"` | Retired, not shown again |
  | Next / OK | no flag change | Normal schedule |
  | Guessed | `guessed: true` on the answer event | Graded as "hard" for that answer (`grade.ts`) |

- **Wrong answers:** a miss is recorded the moment it happens (as today). "Guessed" doesn't apply. Hard or Next are still allowed.
- **Every gesture has a button twin.** Swipes are a shortcut, never the only way. Keyboard shortcuts stay (1–3, Space/Enter, G, H, E, N).
- Touch targets at least 44 px. Answer buttons at least 52 px tall.
- Colours: Hard orange, Easy teal, Next/OK blue, Guessed purple. Right green, wrong red, always with a check / cross icon too.

---

## A · Swipe to sort (building now)

Tinder-style card.

- Tap an answer. The card reveals right/wrong.
- Then fling the card:
  - **← left = Hard** (flag hard)
  - **→ right = Next** (no flag change)
  - **↑ up = Easy** (flag easy, retire it)
- While dragging, a stamp (HARD / NEXT / EASY) fades in with distance. Release past the threshold (≈90 px) and the card flies off. Short of it, the card springs back.
- Faint edge hints after reveal: "← HARD" on the left edge, "NEXT →" on the right, "↑ EASY" at the top.
- Bottom bar after reveal: `[← Hard] [↑ Easy] [Next →]`, the same left/up/right order as the gestures. Next is the primary, wider button.
- **"I guessed"** is a chip next to "Correct", only after a right answer. It toggles. It does not move on by itself.
- Card fades/pops in for the next question.
- Toast after sorting: "Hard · you'll see it more", "Easy · retired".

### Endless run (train mode)

- No fixed round size. You answer until you tap **Stop**.
- Header: Stop button · RUN count · tally chips (hard / next / easy this run).
- Under it: a **streak** chip ("7 in a row", turns gold from 5 and pops every 5 with a toast) and a **daily goal** bar ("37/50 today").
- Stop → run summary (see below).
- Tweaks in the mockup: swipe threshold (40–160 px), edge hints on/off.

---

## B · Drag into a pile (parked)

- After answering, four piles sit along the bottom: **Hard · Guessed · OK · Easy** (4-column grid, 104 px tall).
- Drag the card down. It shrinks as it goes down (to ~0.45×), scaling around the grab point so it stays under the finger.
- The pile under the finger highlights (solid border, darker fill). Release on a pile = sort. Release elsewhere = spring back.
- Tapping a pile also sorts.
- Piles show a count and a little stack of bars that grows (up to 4) so you see them fill up. The pile "bumps" when a card lands.
- Guessed pile is greyed out and not a drop target after a wrong answer.
- Good when **Guessed should be its own category** instead of a chip.
- Hint line above piles: "Tap an answer first" → "Drag the card into a pile, or tap one" → (wrong) "Wrong. Drop it in Hard or OK".
- Implementation note: hit-test with `document.elementsFromPoint` and a `data-bucket` attribute, which is robust to zoom and scroll.

## C · Thumb bar with auto-next (parked)

- No gestures. Question, image/placeholder and text at the top (scrolls if long).
- Answers in a sheet at the bottom (thumb zone, grey background, rounded top).
- After reveal, a 4-button row slides up under the answers: **Hard · Guessed · OK · Easy** (OK wider).
- When right, the **OK button fills up** (≈1.6 s) and moves on by itself, like today's auto-advance. Tap any other button to override. Tapping the question pauses ("Paused").
- When wrong, OK becomes "Next" with no auto-fill, and Guessed is disabled.
- Progress as a row of 10 dots coloured by how each question was sorted.
- Tweak: auto-next delay (0 = off).

## Run summary (after Stop; parked, used by A later)

- "You stopped the run" · big **answered** count · right count.
- Chips: best streak ("new record"), today vs. daily goal ("goal hit").
- A segmented bar of the run: hard / guessed / OK / easy.
- 2×2 grid of pile cards: label, count, what happens to them ("Comes back sooner", "Retired. Won't show unless you undo"), a few question ids.
- Primary: **Drill the N hard + guessed**. Secondary: **Keep going** (resumes the run) and **Home**.

---

## Open questions

- Should Easy need a confirm or an undo toast? It retires the question. An "Undo" on the toast is probably enough.
- Should a streak survive across runs within a day?
- Daily goal: a fixed setting (e.g. 50) or derived from the exam date?
