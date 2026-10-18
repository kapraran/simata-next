import { type Card, createEmptyCard, fsrs, generatorParameters, Rating } from "ts-fsrs";
import type { Grade } from "./grade";

export type { Card };

const RATING = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
} as const;

export function createScheduler(requestRetention = 0.9) {
  // No fuzz: scheduling must be a pure function of the event log.
  const f = fsrs(generatorParameters({ request_retention: requestRetention, enable_fuzz: false }));
  return {
    newCard: (at: number): Card => createEmptyCard(new Date(at)),
    review: (card: Card, grade: Grade, at: number): Card =>
      f.next(card, new Date(at), RATING[grade]).card,
    /** Probability of recalling the card at `now`, 0..1. */
    retrievability: (card: Card, now: number): number =>
      f.get_retrievability(card, new Date(now), false),
  };
}

export type Scheduler = ReturnType<typeof createScheduler>;
