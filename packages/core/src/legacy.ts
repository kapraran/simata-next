import type { AnswerEvent, Flag } from "./events";

/** Shape of the 2022 simata-tmp stats.json entries. */
export type LegacyStat = {
  id: string;
  totalCount: number;
  totalDuration: number;
  answers: { timestamp: number; correct: boolean }[];
  tags?: string[];
};

/**
 * Turn the 2022 stats into events with their original timestamps. The old app only kept a total
 * duration per question, so each of its answers gets that question's average.
 * Tags become flags.
 */
export function convertLegacyStats(stats: readonly LegacyStat[]): {
  events: AnswerEvent[];
  flags: Record<string, Flag>;
} {
  const events: AnswerEvent[] = [];
  const flags: Record<string, Flag> = {};
  for (const s of stats) {
    const avg = s.totalCount > 0 ? Math.round(s.totalDuration / s.totalCount) : 0;
    for (const a of s.answers) {
      events.push({
        id: `legacy-${a.timestamp}-${s.id}`,
        questionId: s.id,
        correct: a.correct,
        durationMs: avg,
        guessed: false,
        mode: "legacy",
        at: a.timestamp,
        deviceId: "legacy-2022",
      });
    }
    if (s.tags?.includes("hard")) flags[s.id] = "hard";
    else if (s.tags?.includes("easy")) flags[s.id] = "easy";
  }
  return { events, flags };
}
