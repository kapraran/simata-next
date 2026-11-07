import type { Question } from "./bank";
import type { Flag, Mode } from "./events";
import type { Progress, QState } from "./fold";
import { type Rng, shuffle } from "./rng";

export type SessionInput = {
  questions: readonly Question[];
  progress: Progress;
  now: number;
  /** Train and sweep have no list: Train picks one question at a time with `pickNext`. */
  mode: Exclude<Mode, "legacy" | "train" | "sweep">;
  size: number;
  flags?: Readonly<Record<string, Flag | null | undefined>>;
  category?: string;
  rng: Rng;
};

export const EXAM_SIZE = 30;
export const EXAM_MINUTES = 35;
const WEAK_RETRIEVABILITY = 0.7;
const CATEGORY_RETRIEVABILITY = 0.9;

/**
 * Pick question ids for a session. Never pads with questions the learner already knows:
 * a short (or empty) session is the correct result when nothing is due.
 */
export function buildSession(input: SessionInput): string[] {
  const { progress, now, mode, size, rng } = input;
  const flags = input.flags ?? {};
  const pool = input.questions.filter((q) => !q.disabled && flags[q.id] !== "easy");

  const R = (id: string): number | undefined => {
    const s = progress.states.get(id);
    return s ? progress.scheduler.retrievability(s.card, now) : undefined;
  };
  const byForgotten = (a: Question, b: Question) => (R(a.id) ?? 1) - (R(b.id) ?? 1);

  switch (mode) {
    case "exam":
      // The real exam draws from the whole bank, so easy flags and mastery don't exclude anything.
      return shuffle(
        input.questions.filter((q) => !q.disabled),
        rng,
      )
        .slice(0, EXAM_SIZE)
        .map((q) => q.id);

    case "weak":
      return pool
        .filter((q) => {
          const s = progress.states.get(q.id);
          if (!s) return false;
          return (
            s.wrongStreak > 0 ||
            s.lastGuessed ||
            flags[q.id] === "hard" ||
            (R(q.id) ?? 1) < WEAK_RETRIEVABILITY
          );
        })
        .sort(byForgotten)
        .slice(0, size)
        .map((q) => q.id);

    case "category":
      return pool
        .filter((q) => q.category === input.category)
        .filter((q) => {
          const r = R(q.id);
          return r === undefined || r < CATEGORY_RETRIEVABILITY;
        })
        .sort(byForgotten)
        .slice(0, size)
        .map((q) => q.id);

    default:
      mode satisfies never;
      return [];
  }
}

/** How many other questions come between a miss and its first retry. */
export const RELEARN_GAP = 8;
/** How many come between the first retry (answered right) and the final confirmation. */
export const CONFIRM_GAP = 30;
/** A question shown in the last this-many answers is not picked again by the even-views rule. */
export const NO_REPEAT = 10;

/** One answer given in the current Train run, oldest first. */
export type RunEntry = { id: string; correct: boolean; guessed: boolean };

export type PickInput = {
  questions: readonly Question[];
  progress: Progress;
  flags?: Readonly<Record<string, Flag | null | undefined>>;
  run: readonly RunEntry[];
  rng: Rng;
};

/**
 * How much exposure a question has had. Lower means it is picked sooner. Never-seen is 0, so
 * unseen questions come before anything seen. A recent miss lowers it a little (0.5 each, up to
 * two); a question flagged hard counts as seen only two thirds as often, so it returns about 1.5
 * times as often as a normal one.
 */
export function effectiveViews(state: QState | undefined, flag: Flag | null | undefined): number {
  const seen = state?.seen ?? 0;
  const wrong = Math.min(state?.wrongStreak ?? 0, 2);
  return (seen - 0.5 * wrong) / (flag === "hard" ? 1.5 : 1);
}

/**
 * Pick the next Train question. No daily cap and no due dates: the whole bank is reachable and
 * every question gets about the same number of views. Only the learner's sorting (hard/easy) and
 * their mistakes change that.
 *
 * 1. A miss (or a correct-but-guessed answer) in this run comes back after RELEARN_GAP other
 *    questions; once answered right it comes back one more time after CONFIRM_GAP.
 * 2. Otherwise the question with the fewest effective views, never one of the last NO_REPEAT shown.
 *
 * Returns undefined only when nothing is left to pick (every question retired or disabled).
 */
export function pickNext(input: PickInput): string | undefined {
  const { progress, run, rng } = input;
  const flags = input.flags ?? {};
  const pool = input.questions.filter((q) => !q.disabled && flags[q.id] !== "easy");
  if (pool.length === 0) return undefined;
  const inPool = new Set(pool.map((q) => q.id));
  const n = run.length;

  // Replay the run to find questions owed a retry.
  const owed = new Map<string, { phase: "relearn" | "confirm"; at: number }>();
  run.forEach((e, i) => {
    const cur = owed.get(e.id);
    if (!e.correct || e.guessed) {
      owed.set(e.id, { phase: "relearn", at: i });
    } else if (cur?.phase === "relearn") {
      owed.set(e.id, { phase: "confirm", at: i });
    } else if (cur?.phase === "confirm") {
      owed.delete(e.id);
    }
  });
  let best: { id: string; overdue: number } | undefined;
  for (const [id, o] of owed) {
    if (!inPool.has(id)) continue;
    const gap = o.phase === "relearn" ? RELEARN_GAP : CONFIRM_GAP;
    const overdue = n - 1 - o.at - gap;
    if (overdue >= 0 && (!best || overdue > best.overdue)) best = { id, overdue };
  }
  if (best) return best.id;

  const recent = new Set(run.slice(-NO_REPEAT).map((e) => e.id));
  // Progress may not include this run's answers yet, so prefer questions not shown in the run.
  const inRun = new Set(run.map((e) => e.id));
  let candidates = pool.filter((q) => !inRun.has(q.id));
  if (candidates.length === 0) candidates = pool.filter((q) => !recent.has(q.id));
  if (candidates.length === 0) candidates = pool; // tiny bank: allow repeats
  let low = Number.POSITIVE_INFINITY;
  let ties: Question[] = [];
  for (const q of candidates) {
    const v = effectiveViews(progress.states.get(q.id), flags[q.id]);
    if (v < low) {
      low = v;
      ties = [q];
    } else if (v === low) ties.push(q);
  }
  return shuffle(ties, rng)[0]?.id;
}
