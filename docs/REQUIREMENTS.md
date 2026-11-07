# Requirements

Running list of requirements gathered in conversation. Newest session at the bottom of each section. Detailed designs live in their own docs (linked). Add to this file whenever a requirement comes up; don't wait to be asked.

---

## Quiz UX

Source: session 2026-11-06.

- **The question must always be on screen.** Design around no or minimal scrolling. Question first, everything else secondary.
- **Answer feedback must stay visible.** After answering, the right/wrong state, the correct answer and the question stay readable. Nothing overlays or hides them.
- **No floating bars over content.** The sort controls (Hard / Easy / Next) sit in the page flow, not `position: fixed` over the card.
- **Auto-advance off by default.** A correct answer stays on screen until the user moves on. The option stays in Settings for anyone who wants it.
- **Compact layout on phones.** Image slot about 120 px, answer buttons about 44 px tall, tight spacing. Details in [UX-ANSWER-AND-SORT.md](UX-ANSWER-AND-SORT.md).
- **Sort model and gestures:** see [UX-ANSWER-AND-SORT.md](UX-ANSWER-AND-SORT.md) (Answer first, sort second; every gesture has a button twin).
- **No empty image box for questions without a picture.** Only a lost picture gets a "Picture lost" tile; a question that never had a picture shows no image area. (Session 2026-11-07.)
- **Lost pictures don't hide questions.** Questions whose image file was lost are still shown and answerable, with a "picture lost" placeholder instead of being disabled. (Session 2026-11-07.)

- **The question is the main player; run stats are one thin line.** Stop, daily-goal bar, tally and streak share a single 32 px strip. No separate RUN counter, no second row. The card has one quiet caption line (id + flag/note tools), then picture, question (18 px) and answers. (Session 2026-11-07. Screenshot showed stats rows plus card header pushing the question down and forcing a scroll.)
- **The quiz fills the screen height and never scrolls the page.** The card scrolls inside itself when a question is long; the strip and the sort bar stay put. The picture slot shrinks on short screens (`clamp(72px, 15dvh, 130px)`). (Session 2026-11-07.)
- **Sort bar is always in the layout.** Hard / Easy / Next are visible but locked until you answer ("Pick an answer"), so answering doesn't resize the card. Hard and Easy stack icon over label so the text is never clipped. (Session 2026-11-07.)

## Question selection (Train)

Source: session 2026-11-07, artifact comment on the revamp mockup.

- **No new-per-day limit.** Learners can see as many new questions per day as they want, and the whole bank is reachable from Train. Remove the `newPerDay` setting and the `newBudget` cap in `packages/core/src/session.ts`.
- **Even exposure as the baseline.** Track every view of every question. Train aims for roughly equal views across all questions, so unseen and rarely seen questions carry more weight.
- **Only the learner's sorting moves the weight.** Hard (and wrong / guessed) raise a question's weight, Easy retires it, Next leaves it on the even schedule.
- **No hint line under the sort bar.** Drop the "Pick an answer" text. The greyed-out Hard / Easy / Next buttons already show they are locked. (User, 2026-11-07, artifact comment.)
- **No daily goal anywhere.** The goal bar comes out of the quiz strip as well (the strip keeps Stop, the sort tally and the streak), and the daily-goal setting goes away. This replaces "daily-goal bar" in the Quiz UX strip requirement above. (User, 2026-11-07, artifact comment.)
- **Never constrained.** Going through the whole bank in one day must be possible. The goal is fast coverage and solid confidence on every question. (User, 2026-11-07: "do what you think is best… def not want to be constrained.")
- **Decided design (2026-11-07):** Train is one endless queue and picks each next question like this:
  1. **Relearn first.** A question answered wrong or "guessed" comes back after about 8 other questions. Once it is right again, it comes back once more about 30 questions later.
  2. **Otherwise, the fewest effective views.** Effective views = (views − 0.5 per recent miss, up to 2) ÷ 1.5 if flagged Hard. Unseen questions have 0 views, so they come first; a Hard question returns about 1.5 times as often. Built as `pickNext` in `packages/core/src/session.ts`; the Weak list, exam and pass chance are unchanged.
  3. Easy questions are retired. Nothing repeats within the last 10 questions. Ties are broken at random.
  - **FSRS stays, but out of the picking.** It still updates on every answer and drives the pass chance and the Weak list. Due dates no longer gate Train.
  - **Confidence per question:** the last 2 answers are right and neither was guessed. Home shows "Confident N/825" in place of "Seen". It is the progress number that matters for "good confidence for all".

## Browser / layout stability

Source: session 2026-11-06.

- **The page must not jump.** The browser chrome shrinking or growing, and the scrollbar appearing, must not move the UI. Done for desktop scrollbars (`scrollbar-gutter: stable` in `apps/web/src/index.css`).
- **Answering must not resize the question card.** Tapping an answer may not change the card's height or reflow the options. Reserve layout slots (answer icon, saved note) instead of adding them on reveal. (Session 2026-11-07. See [UX-ANSWER-AND-SORT.md](UX-ANSWER-AND-SORT.md).)
- **Open:** mobile address-bar behaviour (fixed-height layout vs `dvh`). Not decided. Needs a device test.
- **Open:** fullscreen cannot be forced by the page. Options are F11, or installing as a standalone window (needs a web manifest).

## Platform: PWA, Cloudflare Workers, portable Docker

Source: session 2026-11-07.

- **PWA, to current best practice.** Web app manifest (name, icons incl. maskable, `display: standalone`, theme and background colours, start URL, scope). Service worker for offline use of the app shell and the question bank. Installable on desktop and phone. Follow the MDN / web.dev PWA checklist. Use an update flow that doesn't strand users on an old version.
- **Hosted on Cloudflare Workers.** This is the production host. Config (`wrangler`) is not yet found in the repo. Status: open.
- **Portable with Docker Compose.** The same app must also run from `docker-compose.yml` so it can move to any VM with no code change. Existing: `docker/Dockerfile` and `docker-compose.yml`. Status: needs checking that it covers the web app and API, not only the current setup.
- **Single codebase, two targets.** Workers and Docker differ only in config (env vars, bindings, storage), not in app code. Storage differences must be behind one interface.
- **Hosting target set.** Production is one Cloudflare Worker on the custom domain `simata.kapraran.dev` (Workers Static Assets for the SPA + `/api/*` on the same Worker), backed by D1 `simata-next` and R2 `simata-media`. Source: session 2026-11-07. Deployed and healthy.
- **Auth is optional and config-switched, never removed.** Cloudflare Access is the intended login step: it authenticates the visitor and the Worker verifies the forwarded JWT (`Cf-Access-Jwt-Assertion`). For now it is **off** (`IDENTITY=open`, one shared user) to move faster; enable with `IDENTITY=access` plus `TEAM_DOMAIN`/`ACCESS_AUD`. The Access adapter stays in the code. Source: session 2026-11-07.
- **PWA is required**, not optional: `vite-plugin-pwa`, manifest with maskable icons, standalone display, auto-update service worker. Source: session 2026-11-07.

## Look and feel

Source: session 2026-11-07.

- **Playful UI revamp, driven by the new logo** (`../Simata Road Safety App Icon.png`). The user finds the current look (stock Mantine, grey, orange "S" favicon) boring. Direction: saturated road-sign blue, sticker-style signs with thick white outlines and soft drop shadows, warm yellow highlights (swoosh underline, "spark" lines), chunky rounded type. Status: mockup for review: `docs/mockups/logo-revamp.html` (artifact: https://claude.ai/artifact/NRZWtzUfUX6oVxTTSHhEFf). Fonts: Fredoka for display (Latin only), Manrope for question text (has Greek). Earlier explorations: `docs/mockups/playful-redesign.html`, `docs/mockups/playful-rethink.html`.
- **Home: no daily-goal road widget.** The user did not like the car-on-a-road goal bar in the mockup; removed. (Session 2026-11-07, artifact comment.)
- **Drop Sweep as a separate mode; Train is the one practice entry.** Sweep (unseen questions, ignores the new-per-day cap) confused the user ("what is the Sweep?") and they asked to make it "only Train". Home keeps Train plus Mock exam and Weak. (Session 2026-11-07, artifact comment.)

## Working style (for the agent)

Source: session 2026-11-06.

- Fix the UX, not the symptom. Patches that leave the same problem are not done.
- Verify in a browser at phone size before calling a layout change finished.
- Keep this file updated as requirements come up.

## Content and data sourcing

Source: session 2026-11-07.

- **Prefer an official source for the questions and images.** The user asked to move off the third-party mirror (`drivepoint.gr`, where the current 825-question bank was captured) onto an official source. Finding: there is no public question-bank *dataset*, but the official textbook itself contains the full question bank with answers and images. The user placed the book at `C:\Users\nikos\dev\simata\book_AYTOKINHTA.pdf` (session 2026-11-07): *Θεωρητική Εκπαίδευση Υποψηφίων Οδηγών Αυτοκινήτων*, ΥΠΥΜΕ + Ίδρυμα Ευγενίδου, 1999 (ISBN 960-337-029-0), 393 pp. Structure: pp. 13–229 theory; pp. 230–389 the questions (*ΕΡΩΤΗΣΕΙΣ … ΚΥΚΛΟΦΟΡΙΑΚΗΣ ΑΓΩΓΗΣ / ΘΕΩΡΙΑΣ*) — ~847 numbered questions, each with an image and 2–3 options, the correct one marked `Σ` (σωστό) / wrong `Λ`; 1274 distinct embedded images; pp. 390–392 index. **Constraint:** the Greek text does not extract (subset fonts have a broken encoding — Greek comes out as mojibake, only digits/Latin survive), so reuse requires OCR or a rebuilt glyph map. It is the 1999 edition, so it will not map 1:1 to the app's captured ids. See [PLAN.md](PLAN.md) §10. Parsed results and a bank ↔ book comparison are in [BOOK-RECONCILIATION.md](BOOK-RECONCILIATION.md): the bank is the book's ΕΡΩΤΗΜΑΤΟΛΟΓΙΟ (same section names and numbering); ΣΗΜΑΝΣΗ and ΔΙΑΣΤΑΥΡΩΣΕΙΣ match verbatim (219/236, 84/101); ΠΕΡΙΒΑΛΛΟΝ and ΟΙΚΟΛΟΓΙΑ are absent from the 1999 edition.
- **Never publish the question data or images.** The texts and images are Υ.Μ.Ε. / Ιδρύματος Ευγενίδου intellectual property; keep the bank for personal use only.
