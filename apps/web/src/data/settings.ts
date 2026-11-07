export type Settings = {
  /** Most never-seen questions Train introduces per day. */
  newPerDay: number;
  /** Questions loaded at a time. Runs are endless: the next batch loads when one runs out. */
  sessionSize: number;
  /** After a right answer, move on by itself after a short pause. */
  autoAdvance: boolean;
  /** Answers per day the goal bar counts towards. */
  dailyGoal: number;
};

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 10,
  sessionSize: 10,
  autoAdvance: false,
  dailyGoal: 50,
};

export function parseSettings(raw: string | undefined): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const v = JSON.parse(raw) as Partial<Settings>;
    return {
      newPerDay: clampInt(v.newPerDay, 0, 100, DEFAULT_SETTINGS.newPerDay),
      sessionSize: clampInt(v.sessionSize, 3, 50, DEFAULT_SETTINGS.sessionSize),
      autoAdvance:
        typeof v.autoAdvance === "boolean" ? v.autoAdvance : DEFAULT_SETTINGS.autoAdvance,
      dailyGoal: clampInt(v.dailyGoal, 5, 500, DEFAULT_SETTINGS.dailyGoal),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.round(v)))
    : fallback;
}
