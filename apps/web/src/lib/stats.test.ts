import { type AnswerEvent, foldEvents, type Question } from "@simata/core";
import { describe, expect, it } from "vitest";
import { categoryMastery, dailyStats, dayKey, passChanceTrend, trouble } from "./stats";

const at = (d: number, h = 12) => new Date(2026, 0, d, h).getTime();
const NOW = at(10, 20);

let n = 0;
function ev(q: string, when: number, o: Partial<AnswerEvent> = {}): AnswerEvent {
  return {
    id: `e${n++}`,
    questionId: q,
    correct: true,
    durationMs: 3000,
    guessed: false,
    mode: "train",
    at: when,
    deviceId: "t",
    ...o,
  };
}

const bank = (count = 60): Question[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `C${i % 3} ${i}`,
    category: `C${i % 3}`,
    text: `q${i}`,
    options: [
      { text: "a", correct: true },
      { text: "b", correct: false },
    ],
  }));

describe("dailyStats", () => {
  it("groups by local day with accuracy", () => {
    const stats = dailyStats(
      [ev("a", at(8)), ev("b", at(8, 13), { correct: false }), ev("a", at(9)), ev("a", at(9, 14))],
      NOW,
    );
    expect(stats).toEqual([
      { day: dayKey(at(8)), answers: 2, accuracy: 50 },
      { day: dayKey(at(9)), answers: 2, accuracy: 100 },
    ]);
  });
  it("drops days outside the window", () => {
    expect(dailyStats([ev("a", at(1))], NOW, 5)).toEqual([]);
  });
});

describe("trouble", () => {
  const events = [
    ev("a", at(8), { correct: false, durationMs: 9000 }),
    ev("a", at(9), { correct: false, durationMs: 11000 }),
    ev("b", at(8), { correct: false }),
    ev("c", at(8), { durationMs: 1000 }),
  ];
  it("ranks misses and slow questions", () => {
    const t = trouble(events);
    expect(t.mostMissed.map((x) => x.id)).toEqual(["a", "b"]);
    expect(t.mostMissed[0]).toMatchObject({ misses: 2, seen: 2 });
    expect(t.slowest).toEqual([{ id: "a", avgMs: 10000, seen: 2 }]);
  });
});

describe("trouble ignores idle-tab durations", () => {
  it("does not let a 4 minute answer make a question look slow", () => {
    const t = trouble([
      ev("a", at(8), { durationMs: 240_000 }),
      ev("a", at(9), { durationMs: 2000 }),
      ev("a", at(9, 13), { durationMs: 4000 }),
    ]);
    expect(t.slowest).toEqual([{ id: "a", avgMs: 3000, seen: 3 }]);
  });
});

describe("categoryMastery", () => {
  it("counts unseen questions as zero and lists the weakest category first", () => {
    const questions = bank(6);
    const events = questions
      .filter((q) => q.category === "C0")
      .map((q) => ev(q.id, at(10, 19), { durationMs: 1500 }));
    const out = categoryMastery(questions, foldEvents(events), NOW);
    expect(out.map((c) => c.category).at(-1)).toBe("C0");
    expect(out.find((c) => c.category === "C0")?.mastery).toBeGreaterThan(0.5);
    expect(out.find((c) => c.category === "C1")).toMatchObject({ seen: 0, mastery: 0, total: 2 });
  });
});

describe("passChanceTrend", () => {
  it("rises as questions get learned", () => {
    const questions = bank(60);
    const day1 = questions.slice(0, 20).map((q) => ev(q.id, at(5), { durationMs: 1500 }));
    const day2 = questions.slice(20).map((q) => ev(q.id, at(6), { durationMs: 1500 }));
    const trend = passChanceTrend([...day1, ...day2], questions, NOW, { sims: 400 });
    expect(trend.map((t) => t.day)).toEqual([dayKey(at(5)), dayKey(at(6))]);
    expect(trend[1]?.chance).toBeGreaterThan(trend[0]?.chance ?? 100);
  });
});
