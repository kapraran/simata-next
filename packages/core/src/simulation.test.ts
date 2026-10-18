import { describe, expect, it } from "vitest";
import type { Question } from "./bank";
import type { AnswerEvent } from "./events";
import { foldEvents } from "./fold";
import { passChance } from "./passchance";
import { mulberry32 } from "./rng";
import { buildSession } from "./session";

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

type Day = { answers: number; newQuestions: number };

/**
 * A learner who already knows ~60% of the bank, learns a missed question 80% of the time when
 * shown the answer, and forgets known ones with a 40-day time constant.
 */
function simulate(days: number, newPerDay: number) {
  const rng = mulberry32(2026);
  const questions = realisticBank();
  const known = new Map(questions.map((q) => [q.id, rng() < 0.6]));
  const lastTouched = new Map<string, number>();
  const events: AnswerEvent[] = [];
  const perDay: Day[] = [];
  let id = 0;
  let now = T0;

  for (let d = 0; d < days; d++) {
    now = T0 + d * DAY;
    const dayStart = now;
    let answers = 0;
    let newQuestions = 0;
    let newBudget = newPerDay;

    for (let round = 0; round < 60; round++) {
      const progress = foldEvents(events);
      const ids = buildSession({
        questions,
        progress,
        now,
        mode: "train",
        size: 10,
        newBudget,
        rng,
      });
      if (ids.length === 0) break;

      for (const qid of ids) {
        const q = questions.find((x) => x.id === qid) as Question;
        const isNew = !progress.states.has(qid);
        if (isNew) {
          newQuestions++;
          newBudget--;
        }

        let knows = known.get(qid) as boolean;
        const last = lastTouched.get(qid);
        if (knows && last !== undefined && rng() > Math.exp(-(now - last) / DAY / 40))
          knows = false;

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
        known.set(qid, knows || rng() < 0.8);
        lastTouched.set(qid, now);
        answers++;
        now += 15_000;
      }
    }
    perDay.push({ answers, newQuestions });
    void dayStart;
  }

  const end = T0 + days * DAY;
  const progress = foldEvents(events);
  // "Retired": a card you would still recall at 90% for two weeks or more.
  const retired = [...progress.states.values()].filter((s) => s.card.stability >= 14).length;
  return { questions, progress, perDay, end, retired };
}

describe("60-day simulated learner", () => {
  const r = simulate(60, 20);
  const seen = r.progress.states.size;
  const steady = r.perDay.slice(45).map((d) => d.answers);
  console.log(
    `retired ${r.retired}/825, steady-state answers/day avg ${Math.round(steady.reduce((a, b) => a + b, 0) / steady.length)} max ${Math.max(...steady)}`,
  );

  it("finishes the sweep and keeps daily load bounded", () => {
    expect(seen).toBe(825);
    const steady = r.perDay.slice(45);
    const max = Math.max(...steady.map((d) => d.answers));
    expect(max).toBeLessThanOrEqual(150);
    // Not grinding the whole bank: far below 825 answers on any steady-state day.
    expect(max).toBeLessThan(825 / 4);
  });

  it("retires most of the bank (stability of two weeks or more)", () => {
    expect(r.retired / 825).toBeGreaterThanOrEqual(0.6);
  });

  it("ends with a meaningful pass chance", () => {
    const p = passChance(r.questions, r.progress, r.end, mulberry32(1));
    expect(p).toBeGreaterThan(0.5);
  });
});
