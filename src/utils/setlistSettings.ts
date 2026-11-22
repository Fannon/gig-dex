import type { Setlist, SetlistSongSettings, Song } from "../db";
import { standardToGermanChord } from "./chordNotation";
import { savedReadingPreferences } from "./readingPreferences";
import { tempoMeter } from "./tempo";

const NATURAL_PITCHES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Pitch class (0–11) of a key's root, or null when the key is missing or unreadable. */
export function keyPitch(key: string | null | undefined): number | null {
  const match = /^\s*([A-G])([#b]?)/.exec(key ?? "");
  if (!match) return null;
  return (NATURAL_PITCHES[match[1]] + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0) + 12) % 12;
}

/** Keep a transposition within one octave either way, as the transpose buttons do. */
export function wrapTranspose(value: number): number {
  const wrapped = value % 12;
  return wrapped === 0 ? 0 : wrapped; // Avoid -0.
}

/** The song's key: the stored field, or its {key} directive. */
export function songKey(song: Pick<Song, "key" | "content"> | Partial<Song> | undefined): string | undefined {
  return song?.key?.trim() || /\{key:\s*([^}]+)\}/i.exec(song?.content ?? "")?.[1]?.trim() || undefined;
}

/**
 * The transposition to apply to the song as it is now. An entry remembers the song key its
 * transposition was chosen for (`baseKey`), so it keeps sounding the same after the song's key
 * changes, even when the song and setlist changes arrive separately through sync.
 */
export function effectiveTranspose(song: Partial<Song> | undefined, setting?: SetlistSongSettings): number {
  const transpose = setting?.transpose ?? 0;
  const base = keyPitch(setting?.baseKey);
  const current = keyPitch(songKey(song));
  if (base === null || current === null) return transpose;
  return wrapTranspose(transpose + base - current);
}

/** A setlist entry transposed by `transpose` from the song's current key. */
export function entrySetting(song: Partial<Song> | undefined, transpose: number): SetlistSongSettings {
  const baseKey = songKey(song);
  return keyPitch(baseKey) === null ? { transpose } : { transpose, baseKey };
}

export const defaultSongSetting = (song: Partial<Song> | undefined): SetlistSongSettings =>
  entrySetting(song, song?.defaultTranspose ?? 0);

/**
 * How an entry must change after a song edit that moved its chords by `chordShift` semitones and
 * its key label from `oldKey` to `newKey`, so the entry keeps sounding the same. Returns null when
 * the entry already corrects itself (it has a base key and the label moved with the chords).
 */
export function rebaseSetting(
  setting: SetlistSongSettings,
  oldKey: string | undefined,
  newKey: string | undefined,
  chordShift: number,
): SetlistSongSettings | null {
  const oldPitch = keyPitch(oldKey);
  const newPitch = keyPitch(newKey);
  const labelMoved =
    oldPitch === null || newPitch === null
      ? (oldKey ?? "") !== (newKey ?? "")
      : wrapTranspose(newPitch - oldPitch - chordShift) !== 0;
  const base = keyPitch(setting.baseKey);
  if (!labelMoved && (base !== null || wrapTranspose(chordShift) === 0)) return null;
  // What the entry played before the edit, relative to the old chords.
  const before =
    base !== null && oldPitch !== null ? wrapTranspose(setting.transpose + base - oldPitch) : setting.transpose;
  const transpose = wrapTranspose(before - chordShift);
  return newPitch === null || !newKey ? { transpose } : { transpose, baseKey: newKey };
}

export const occurrenceSettings = (list: Setlist): SetlistSongSettings[] =>
  list.songIds.map((_, index) => list.songSettings?.[index] ?? { transpose: 0 });

export function transposeKey(key: string | undefined, transpose: number): string {
  if (!key) return "Unknown key";
  const match = /^([A-G])([#b]?)(.*)$/.exec(key);
  if (!match) return key;
  const pitch = NATURAL_PITCHES[match[1]] + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0);
  const names =
    match[2] === "b"
      ? ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
      : ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return names[(((pitch + transpose) % 12) + 12) % 12] + match[3];
}
export function songSettingDetails(
  song: Song | undefined,
  setting?: SetlistSongSettings,
  chordMode = savedReadingPreferences().chordMode,
) {
  const transpose = effectiveTranspose(song, setting);
  const key = songKey(song);
  const transposedKey = transposeKey(key, transpose);
  const displayedKey = chordMode === "german" ? standardToGermanChord(transposedKey) : transposedKey;
  const bpm = song?.tempo ?? Number(/\{tempo:\s*([^}]+)\}/i.exec(song?.content ?? "")?.[1]);
  const time = song?.time || /\{time:\s*([^}]+)\}/i.exec(song?.content ?? "")?.[1]?.trim();
  return { key: displayedKey, transpose, bpm, time };
}
export function settingLabel(song: Song | undefined, setting?: SetlistSongSettings) {
  const { key, transpose, bpm, time } = songSettingDetails(song, setting);
  return [
    key,
    transpose ? `T${transpose > 0 ? "+" : ""}${transpose}` : "",
    bpm > 0 ? `${bpm}bpm` : "",
    tempoMeter(time).label,
  ]
    .filter(Boolean)
    .join(" | ");
}
