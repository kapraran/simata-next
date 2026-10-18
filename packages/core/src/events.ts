export type Mode = "train" | "sweep" | "weak" | "category" | "exam" | "legacy";
export type Flag = "hard" | "easy";

/** One answer. The append-only log of these is the only stored progress. */
export type AnswerEvent = {
  /** Unique and sortable (ULID on the client). Sync dedupes on it. */
  id: string;
  questionId: string;
  correct: boolean;
  durationMs: number;
  /** Learner tapped "I guessed" after a correct answer. */
  guessed: boolean;
  mode: Mode;
  /** Epoch ms. */
  at: number;
  deviceId: string;
};

export function compareEvents(a: AnswerEvent, b: AnswerEvent): number {
  return a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
