import type { AnswerEvent } from "./events";

export type Grade = "again" | "hard" | "good" | "easy";

export const DEFAULT_SLOW_MS = 15_000;
export const DEFAULT_FAST_MS = 7_500;

export type GradeContext = {
  /** First time this question is ever answered. */
  firstSeen: boolean;
  /** Answers slower than this count as hesitation (the learner's own 75th percentile). */
  slowMs: number;
  /** First-sight answers at least this fast count as already known (the learner's median). */
  fastMs: number;
};

/**
 * Map an answer to a spaced-repetition grade.
 * Wrong -> again. Right but guessed or slow -> hard. Right and fast on first sight -> easy.
 */
export function gradeAnswer(e: AnswerEvent, ctx: GradeContext): Grade {
  if (!e.correct) return "again";
  if (e.guessed) return "hard";
  if (e.durationMs > ctx.slowMs) return "hard";
  if (ctx.firstSeen && e.durationMs <= ctx.fastMs) return "easy";
  return "good";
}
