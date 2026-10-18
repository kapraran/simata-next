export type ExamResult = {
  /** Start time, epoch ms. Also the key suffix. */
  at: number;
  right: number;
  /** Questions in the exam, answered or not. */
  total: number;
  /** Mistakes allowed by the rule at the time. */
  maxWrong: number;
  passed: boolean;
  durationMs: number;
};

export function parseExam(raw: string): ExamResult | null {
  try {
    const v = JSON.parse(raw) as Partial<ExamResult>;
    if (
      typeof v.at === "number" &&
      typeof v.right === "number" &&
      typeof v.total === "number" &&
      typeof v.passed === "boolean"
    ) {
      return {
        at: v.at,
        right: v.right,
        total: v.total,
        maxWrong: typeof v.maxWrong === "number" ? v.maxWrong : 1,
        passed: v.passed,
        durationMs: typeof v.durationMs === "number" ? v.durationMs : 0,
      };
    }
  } catch {}
  return null;
}

/** Longest run of passes ending at the most recent exam. */
export function currentPassStreak(exams: readonly ExamResult[]): number {
  let n = 0;
  for (const e of [...exams].sort((a, b) => b.at - a.at)) {
    if (!e.passed) break;
    n++;
  }
  return n;
}
