import { describe, expect, it } from "vitest";
import type { Question } from "./bank";
import type { AnswerEvent } from "./events";
import { foldEvents } from "./fold";
import { gradeAnswer } from "./grade";
import { convertLegacyStats } from "./legacy";
import { passChance } from "./passchance";
import { mulberry32 } from "./rng";
import { buildSession, newSeenBetween } from "./session";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1, 9);

function bank(n = 120): Question[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `C${i % 5} ${i}`,
    category: `C${i % 5}`,
    text: `q${i}`,
    options:
      i % 3 === 0
        ? [
            { text: "a", correct: true },
            { text: "b", correct: false },
          ]
        : [
            { text: "a", correct: true },
            { text: "b", correct: false },
            { text: "c", correct: false },
          ],
  }));
}

let seq = 0;
function ev(q: string, at: number, o: Partial<AnswerEvent> = {}): AnswerEvent {
  return {
    id: `e${String(seq++).padStart(6, "0")}`,
    questionId: q,
    correct: true,
    durationMs: 4000,
    guessed: false,
    mode: "train",
    at,
    deviceId: "t",
    ...o,
  };
}

describe("gradeAnswer", () => {
  const ctx = { firstSeen: false, slowMs: 10_000, fastMs: 5000 };
  it("wrong is again, guessed or slow is hard", () => {
    expect(gradeAnswer(ev("q", 0, { correct: false }), ctx)).toBe("again");
    expect(gradeAnswer(ev("q", 0, { guessed: true }), ctx)).toBe("hard");
    expect(gradeAnswer(ev("q", 0, { durationMs: 11_000 }), ctx)).toBe("hard");
    expect(gradeAnswer(ev("q", 0), ctx)).toBe("good");
  });
  it("fast first-sight correct is easy, but not if guessed", () => {
    const first = { firstSeen: true, slowMs: 10_000, fastMs: 5000 };
    expect(gradeAnswer(ev("q", 0, { durationMs: 3000 }), first)).toBe("easy");
    expect(gradeAnswer(ev("q", 0, { durationMs: 3000, guessed: true }), first)).toBe("hard");
    expect(gradeAnswer(ev("q", 0, { durationMs: 8000 }), first)).toBe("good");
  });
});

describe("foldEvents", () => {
  it("is independent of input order and deterministic", () => {
    const events = [
      ev("a", T0),
      ev("a", T0 + DAY),
      ev("b", T0 + 5),
      ev("a", T0 + 4 * DAY, { correct: false }),
    ];
    const a = foldEvents(events);
    const b = foldEvents([...events].reverse());
    expect(a.states.get("a")?.card.due).toEqual(b.states.get("a")?.card.due);
    expect(a.states.get("a")).toMatchObject({
      seen: 3,
      correct: 2,
      wrongStreak: 1,
      firstCorrect: true,
    });
  });
  it("pushes a fast first-sight correct answer far out and a wrong one to minutes", () => {
    const p = foldEvents([
      ev("easy", T0, { durationMs: 2000 }),
      ev("hard", T0, { correct: false }),
    ]);
    const easyDue = (p.states.get("easy")?.card.due.getTime() ?? 0) - T0;
    const hardDue = (p.states.get("hard")?.card.due.getTime() ?? 0) - T0;
    expect(easyDue).toBeGreaterThan(5 * DAY);
    expect(hardDue).toBeLessThan(DAY / 2);
  });
});

describe("buildSession", () => {
  const questions = bank();
  const base = { questions, now: T0, size: 10, newBudget: 5, rng: mulberry32(1) };

  it("train on an empty history only introduces the new-question budget", () => {
    const ids = buildSession({ ...base, progress: foldEvents([]), mode: "train" });
    expect(ids).toHaveLength(5);
  });

  it("train puts due questions first and never pads with known ones", () => {
    const events = questions.slice(0, 30).map((q) => ev(q.id, T0 - 30 * DAY, { durationMs: 2000 }));
    const progress = foldEvents(events);
    const ids = buildSession({ ...base, progress, now: T0 + 1000, mode: "train", newBudget: 0 });
    // 30 answered long ago: those are due. Nothing new allowed.
    expect(ids).toHaveLength(10);
    expect(ids.every((id) => questions.slice(0, 30).some((q) => q.id === id))).toBe(true);

    const fresh = foldEvents(questions.map((q) => ev(q.id, T0, { durationMs: 2000 })));
    expect(
      buildSession({ ...base, progress: fresh, now: T0 + 1000, mode: "train", newBudget: 0 }),
    ).toEqual([]);
  });

  it("skips disabled questions and ones flagged easy", () => {
    const qs = bank(40).map((q, i) => (i < 10 ? { ...q, disabled: true as const } : q));
    const flags = { [qs[10]?.id as string]: "easy" as const };
    const ids = buildSession({
      ...base,
      questions: qs,
      progress: foldEvents([]),
      mode: "sweep",
      size: 100,
      flags,
    });
    expect(ids).toHaveLength(29);
    expect(ids).not.toContain(qs[0]?.id);
    expect(ids).not.toContain(qs[10]?.id);
  });

  it("weak mode picks recent mistakes and guesses, worst first", () => {
    const progress = foldEvents([
      ev(questions[0]?.id as string, T0, { correct: false }),
      ev(questions[1]?.id as string, T0, { guessed: true }),
      ev(questions[2]?.id as string, T0, { durationMs: 2000 }),
    ]);
    const ids = buildSession({ ...base, progress, mode: "weak" });
    expect(ids).toContain(questions[0]?.id);
    expect(ids).toContain(questions[1]?.id);
    expect(ids).not.toContain(questions[2]?.id);
  });

  it("exam ignores easy flags (the real exam draws from the whole bank)", () => {
    const flags = Object.fromEntries(questions.map((q) => [q.id, "easy" as const]));
    const ids = buildSession({ ...base, progress: foldEvents([]), mode: "exam", flags });
    expect(ids).toHaveLength(30);
  });

  it("exam draws 30 distinct questions", () => {
    const ids = buildSession({ ...base, progress: foldEvents([]), mode: "exam" });
    expect(new Set(ids).size).toBe(30);
  });

  it("counts questions first seen today", () => {
    const progress = foldEvents([ev("a", T0), ev("b", T0 + 1), ev("c", T0 - DAY)]);
    expect(newSeenBetween(progress, T0 - 1000, T0 + DAY)).toBe(2);
  });
});

describe("passChance", () => {
  const questions = bank(60);
  const rng = () => mulberry32(7);

  it("is low with no history and rises as questions are learned", () => {
    const none = passChance(questions, foldEvents([]), T0, rng());
    const learned = foldEvents(questions.map((q) => ev(q.id, T0, { durationMs: 2000 })));
    const some = passChance(questions, learned, T0 + 2 * DAY, rng());
    expect(none).toBeLessThan(0.05);
    expect(some).toBeGreaterThan(none);
  });

  it("is zero when the bank is smaller than one exam", () => {
    expect(passChance(bank(10), foldEvents([]), T0, rng())).toBe(0);
  });
});

describe("convertLegacyStats", () => {
  it("makes timestamped events with the average duration and flags", () => {
    const { events, flags } = convertLegacyStats([
      {
        id: "A 1",
        totalCount: 2,
        totalDuration: 10_000,
        answers: [
          { timestamp: 100, correct: false },
          { timestamp: 200, correct: true },
        ],
        tags: ["hard"],
      },
      { id: "A 2", totalCount: 0, totalDuration: 0, answers: [], tags: [] },
    ]);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      questionId: "A 1",
      durationMs: 5000,
      at: 100,
      mode: "legacy",
    });
    expect(flags).toEqual({ "A 1": "hard" });
  });
});
