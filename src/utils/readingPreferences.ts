import type { ChordMode } from "./chordEngine";

export const READING_PREFERENCES_EVENT = "reading-preferences-changed";
export const columnLimits = [0, 1, 2, 3, 4, 6] as const;
export interface ReadingPreferences {
  chordMode: ChordMode;
  maxColumns: number;
  wrapLines: boolean;
}
const defaults: ReadingPreferences = { chordMode: "standard", maxColumns: 0, wrapLines: true };
let sessionOverride: ReadingPreferences | undefined;

function normalize(value: unknown): ReadingPreferences {
  if (!value || typeof value !== "object") return { ...defaults };
  const record = value as Partial<ReadingPreferences>;
  return {
    chordMode: record.chordMode === "nashville" || record.chordMode === "roman" ? record.chordMode : "standard",
    maxColumns: columnLimits.some((limit) => limit === record.maxColumns) ? (record.maxColumns ?? 0) : 0,
    wrapLines: typeof record.wrapLines === "boolean" ? record.wrapLines : true,
  };
}

export function savedReadingPreferences(): ReadingPreferences {
  if (sessionOverride) return sessionOverride;
  try {
    return normalize(JSON.parse(localStorage.getItem("song_reading_preferences") ?? "null"));
  } catch {
    return { ...defaults };
  }
}

export function applyReadingPreferences(value: ReadingPreferences) {
  const preferences = normalize(value);
  try {
    localStorage.setItem("song_reading_preferences", JSON.stringify(preferences));
    sessionOverride = undefined;
  } catch {
    sessionOverride = preferences;
  }
  window.dispatchEvent(new Event(READING_PREFERENCES_EVENT));
}
