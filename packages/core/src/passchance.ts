import type { Question } from "./bank";
import type { Progress } from "./fold";
import { type Rng, shuffle } from "./rng";
import { EXAM_SIZE } from "./session";

export type PassRule = { questions: number; maxWrong: number };
/** Unofficial sources: 30 questions, at most 1 mistake. Verify, then change here only. */
export const DEFAULT_RULE: PassRule = { questions: EXAM_SIZE, maxWrong: 1 };

/** Probability of answering one question right now, counting lucky guesses. */
export function pCorrect(
  q: Question,
  progress: Progress,
  now: number,
  unseenPrior: number,
): number {
  const s = progress.states.get(q.id);
  if (!s) return unseenPrior;
  const r = progress.scheduler.retrievability(s.card, now);
  return r + (1 - r) / q.options.length;
}

/** Share of first-ever answers that were right, shrunk towards `fallback` while data is thin. */
export function firstSightAccuracy(progress: Progress, fallback = 0.6): number {
  let right = 0;
  for (const s of progress.states.values()) if (s.firstCorrect) right++;
  const weight = 20;
  return (right + fallback * weight) / (progress.states.size + weight);
}

/** Monte Carlo chance of passing an exam drawn from the enabled questions as things stand now. */
export function passChance(
  questions: readonly Question[],
  progress: Progress,
  now: number,
  rng: Rng,
  opts: { sims?: number; rule?: PassRule; unseenPrior?: number } = {},
): number {
  const rule = opts.rule ?? DEFAULT_RULE;
  const sims = opts.sims ?? 2000;
  const pool = questions.filter((q) => !q.disabled);
  if (pool.length < rule.questions) return 0;
  const prior = opts.unseenPrior ?? firstSightAccuracy(progress);
  const p = pool.map((q) => pCorrect(q, progress, now, prior));

  const idx = pool.map((_, i) => i);
  let passes = 0;
  for (let s = 0; s < sims; s++) {
    let wrong = 0;
    for (const i of shuffle(idx, rng).slice(0, rule.questions)) {
      if (rng() >= (p[i] as number)) wrong++;
    }
    if (wrong <= rule.maxWrong) passes++;
  }
  return passes / sims;
}
