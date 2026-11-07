import { describe, expect, it } from "vitest";
import type { Question } from "./bank";
import type { AnswerEvent } from "./events";
import { foldEvents } from "./fold";
import { passChance } from "./passchance";
import { mulberry32 } from "./rng";
import { pickNext, type RunEntry } from "./session";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1, 9);

/** Synthetic bank shaped like the real one: 825 questions, 293 with 2 options, 532 with 3. */
function realisticBank(): Question[] {
  return Array.from({ length: 825 }, (_, i) => ({
    id: `C${i % 25} ${i}`,
    category: `C${i % 25}`,
    text: `q${i}`,
    options: Array.from({ length: i < 293 ? 2 : 3 }, (_, k) => ({
      text: `o${k}`,
      correct: k === 0,
    })),
  }));
}

/**
 * A learner who already knows ~60% of the bank, learns a missed question 80% of the time when
 * shown the answer, and forgets known ones with a 40-day time constant. Answers `perDay`
 * questions a day in one run per day, with no cap on new questions.
 */
function simulate(days: number, perDay: number) {
  const rng = mulberry32(2026);
  const questions = realisticBank();
  const known = new Map(questions.map((q) => [q.id, rng() < 0.6]));
  const lastTouched = new Map<string, number>();
  const events: AnswerEvent[] = [];
  let id = 0;
  let now = T0;
  const seenByDay: number[] = [];

  for (let d = 0; d < days; d++) {
    now = T0 + d * DAY;
    const run: RunEntry[] = [];
    for (let i = 0; i < perDay; i++) {
      const qid = pickNext({ questions, progress: foldEvents(events), run, rng });
      if (!qid) break;
      const q = questions.find((x) => x.id === qid) as Question;
      let knows = known.get(qid) as boolean;
      const last = lastTouched.get(qid);
      if (knows && last !== undefined && rng() > Math.exp(-(now - last) / DAY / 40)) knows = false;

      const correct = knows ? rng() < 0.97 : rng() < 1 / q.options.length;
      const guessed = correct && !knows && rng() < 0.7;
      const durationMs = knows ? 3000 + rng() * 3000 : 12_000 + rng() * 8000;
      events.push({
        id: `s${String(id++).padStart(7, "0")}`,
        questionId: qid,
        correct,
        durationMs,
        guessed,
        mode: "train",
        at: now,
        deviceId: "sim",
      });
      run.push({ id: qid, correct, guessed });
      known.set(qid, knows || rng() < 0.8);
      lastTouched.set(qid, now);
      now += 15_000;
    }
    seenByDay.push(foldEvents(events).states.size);
  }
  return { questions, progress: foldEvents(events), end: T0 + days * DAY, seenByDay };
}

describe("simulated learner with no daily cap", () => {
  it("can see the whole bank in a few long sittings (misses cost extra retries)", () => {
    const r = simulate(3, 500);
    expect(r.seenByDay[2]).toBe(825);
  });

  const r = simulate(60, 120);
  // The pass chance comes from FSRS recall, which is conservative when reviews are evenly spaced
  // instead of scheduled by due date, so the bar is lower than it was with due-date scheduling.
  it("ends with a meaningful pass chance", () => {
    const p = passChance(r.questions, r.progress, r.end, mulberry32(1));
    expect(p).toBeGreaterThan(0.3);
  });

  it("builds confidence on most of the bank", () => {
    const confident = [...r.progress.states.values()].filter((s) => s.rightStreak >= 2).length;
    expect(confident / 825).toBeGreaterThan(0.8);
  });
});
