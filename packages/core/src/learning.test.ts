import { describe, expect, it } from "vitest";
import type { Question } from "./bank";
import type { AnswerEvent } from "./events";
import { foldEvents } from "./fold";
import { gradeAnswer } from "./grade";
import { convertLegacyStats } from "./legacy";
import { passChance } from "./passchance";
import { mulberry32 } from "./rng";
import { buildSession, NO_REPEAT, pickNext, RELEARN_GAP, type RunEntry } from "./session";

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
  const base = { questions, now: T0, size: 10, rng: mulberry32(1) };

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

describe("pickNext", () => {
  const questions = bank(60);
  const ids = questions.map((q) => q.id);

  /** Run the picker against its own answers, all right unless `miss` says otherwise. */
  function drive(
    steps: number,
    opts: {
      miss?: (id: string, i: number) => boolean;
      flags?: Record<string, "hard" | "easy">;
    } = {},
  ) {
    const rng = mulberry32(3);
    const events: AnswerEvent[] = [];
    const run: RunEntry[] = [];
    for (let i = 0; i < steps; i++) {
      const id = pickNext({ questions, progress: foldEvents(events), flags: opts.flags, run, rng });
      if (!id) break;
      const correct = !opts.miss?.(id, i);
      run.push({ id, correct, guessed: false });
      events.push(ev(id, T0 + i * 1000, { correct }));
    }
    return run;
  }

  it("shows every question once before any is shown twice", () => {
    const run = drive(60);
    expect(new Set(run.map((r) => r.id)).size).toBe(60);
  });

  it("is not capped per day: the whole bank can be done in one sitting", () => {
    const run = drive(120);
    const counts = new Map<string, number>();
    for (const r of run) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
    expect(counts.size).toBe(60);
    expect([...counts.values()].every((c) => c === 2)).toBe(true);
  });

  it("brings a miss back after RELEARN_GAP others, then once more later", () => {
    const target = ids[0] as string;
    let missed = false;
    const run = drive(100, {
      miss: (id) => {
        if (id === target && !missed) {
          missed = true;
          return true;
        }
        return false;
      },
    });
    const at = run.map((r, i) => (r.id === target ? i : -1)).filter((i) => i >= 0);
    expect(at.length).toBeGreaterThanOrEqual(3);
    expect((at[1] as number) - (at[0] as number)).toBe(RELEARN_GAP + 1);
    expect((at[2] as number) - (at[1] as number)).toBeGreaterThanOrEqual(30);
  });

  it("never picks easy questions and never repeats within the last NO_REPEAT", () => {
    const flags = { [ids[1] as string]: "easy" as const, [ids[2] as string]: "easy" as const };
    const run = drive(150, { flags });
    expect(run.some((r) => r.id === ids[1] || r.id === ids[2])).toBe(false);
    run.forEach((r, i) => {
      const prior = run.slice(Math.max(0, i - NO_REPEAT), i).map((x) => x.id);
      expect(prior).not.toContain(r.id);
    });
  });

  it("shows a hard-flagged question more often than a normal one", () => {
    const hard = ids[5] as string;
    const run = drive(300, { flags: { [hard]: "hard" } });
    const count = (id: string) => run.filter((r) => r.id === id).length;
    expect(count(hard)).toBeGreaterThan(count(ids[6] as string));
  });

  it("returns undefined when everything is retired", () => {
    const flags = Object.fromEntries(ids.map((id) => [id, "easy" as const]));
    expect(
      pickNext({ questions, progress: foldEvents([]), flags, run: [], rng: mulberry32(1) }),
    ).toBeUndefined();
  });
});
