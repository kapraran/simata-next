import { type AnswerEvent, compareEvents } from "./events";
import { DEFAULT_FAST_MS, DEFAULT_SLOW_MS, gradeAnswer } from "./grade";
import { type Card, createScheduler, type Scheduler } from "./scheduler";

export type QState = {
  card: Card;
  seen: number;
  correct: number;
  /** Wrong answers in a row at the end of the history. */
  wrongStreak: number;
  /** Right, unguessed answers in a row at the end. Two or more means "confident". */
  rightStreak: number;
  firstSeenAt: number;
  /** Whether the very first answer was right. */
  firstCorrect: boolean;
  lastAt: number;
  lastCorrect: boolean;
  lastGuessed: boolean;
};

export type Progress = {
  states: Map<string, QState>;
  /** Learner's current "slow" threshold (75th percentile of correct answer times). */
  slowMs: number;
  /** Median of correct answer times: faster than this on first sight counts as known. */
  fastMs: number;
  scheduler: Scheduler;
};

/** Last two answers right and unguessed. */
export const isConfident = (s: QState | undefined): boolean => (s?.rightStreak ?? 0) >= 2;

const MIN_SAMPLES_FOR_SLOW = 20;
/** Longer than this is an idle tab, not thinking time; it must not skew the speed thresholds. */
export const MAX_PLAUSIBLE_MS = 120_000;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] as number;
}

/** Derive all card state from the event log. Pure and deterministic. */
export function foldEvents(
  events: readonly AnswerEvent[],
  opts: { retention?: number; scheduler?: Scheduler } = {},
): Progress {
  const scheduler = opts.scheduler ?? createScheduler(opts.retention);
  const states = new Map<string, QState>();
  const correctTimes: number[] = []; // kept sorted
  let slowMs = DEFAULT_SLOW_MS;
  let fastMs = DEFAULT_FAST_MS;

  for (const e of [...events].sort(compareEvents)) {
    const prev = states.get(e.questionId);
    const grade = gradeAnswer(e, { firstSeen: !prev, slowMs, fastMs });
    const card = scheduler.review(prev?.card ?? scheduler.newCard(e.at), grade, e.at);
    states.set(e.questionId, {
      card,
      seen: (prev?.seen ?? 0) + 1,
      correct: (prev?.correct ?? 0) + (e.correct ? 1 : 0),
      wrongStreak: e.correct ? 0 : (prev?.wrongStreak ?? 0) + 1,
      rightStreak: e.correct && !e.guessed ? (prev?.rightStreak ?? 0) + 1 : 0,
      firstSeenAt: prev?.firstSeenAt ?? e.at,
      firstCorrect: prev?.firstCorrect ?? e.correct,
      lastAt: e.at,
      lastCorrect: e.correct,
      lastGuessed: e.correct && e.guessed,
    });

    if (e.correct && !e.guessed && e.durationMs <= MAX_PLAUSIBLE_MS) {
      const i = correctTimes.findIndex((t) => t > e.durationMs);
      correctTimes.splice(i < 0 ? correctTimes.length : i, 0, e.durationMs);
      if (correctTimes.length >= MIN_SAMPLES_FOR_SLOW) {
        slowMs = percentile(correctTimes, 0.75);
        fastMs = percentile(correctTimes, 0.5);
      }
    }
  }
  return { states, slowMs, fastMs, scheduler };
}
