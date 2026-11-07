export type Settings = {
  /** After a right answer, move on by itself after a short pause. */
  autoAdvance: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  autoAdvance: false,
};

/** Old stored settings also had newPerDay, sessionSize and dailyGoal; they are ignored now. */
export function parseSettings(raw: string | undefined): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const v = JSON.parse(raw) as Partial<Settings>;
    return {
      autoAdvance:
        typeof v.autoAdvance === "boolean" ? v.autoAdvance : DEFAULT_SETTINGS.autoAdvance,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
