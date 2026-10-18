import type { Question } from "./bank";
import type { Flag, Mode } from "./events";
import type { Progress } from "./fold";
import { type Rng, shuffle } from "./rng";

export type SessionInput = {
  questions: readonly Question[];
  progress: Progress;
  now: number;
  mode: Exclude<Mode, "legacy">;
  size: number;
  /** How many never-seen questions may still be introduced today. */
  newBudget: number;
  flags?: Readonly<Record<string, Flag | null | undefined>>;
  category?: string;
  rng: Rng;
};

export const EXAM_SIZE = 30;
export const EXAM_MINUTES = 35;
const WEAK_RETRIEVABILITY = 0.7;
const CATEGORY_RETRIEVABILITY = 0.9;

/** Questions first seen in [from, to). Subtract from newPerDay to get today's newBudget. */
export function newSeenBetween(progress: Progress, from: number, to: number): number {
  let n = 0;
  for (const s of progress.states.values()) if (s.firstSeenAt >= from && s.firstSeenAt < to) n++;
  return n;
}

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

  const unseen = pool.filter((q) => !progress.states.has(q.id));
  const due = pool
    .filter((q) => {
      const s = progress.states.get(q.id);
      return s !== undefined && s.card.due.getTime() <= now;
    })
    .sort(byForgotten);

  switch (mode) {
    case "exam":
      // The real exam draws from the whole bank, so easy flags and mastery don't exclude anything.
      return shuffle(
        input.questions.filter((q) => !q.disabled),
        rng,
      )
        .slice(0, EXAM_SIZE)
        .map((q) => q.id);

    case "sweep":
      return shuffle(unseen, rng)
        .slice(0, size)
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

    case "train": {
      const picked = due.slice(0, size);
      const room = Math.min(input.newBudget, size - picked.length);
      const fresh = room > 0 ? shuffle(unseen, rng).slice(0, room) : [];
      return [...picked, ...fresh].map((q) => q.id);
    }

    default:
      mode satisfies never;
      return [];
  }
}
