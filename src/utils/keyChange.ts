import { Chord } from "chordsheetjs";
import { keyPitch } from "./setlistSettings";

// Conventional key names: the spelling with the fewest accidentals.
const MAJOR_KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_KEYS = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];
// Keys whose chords are spelled with flats. C major and A minor use flats too, because their
// common borrowed chords are flat (Bb, Eb, Ab).
const FLAT_KEYS = new Set(["C", "F", "Bb", "Eb", "Ab", "Db", "Am", "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm"]);

const isMinorKey = (key: string) => /^\s*[A-G][#b]?m(?!aj)/.test(key);

/** The conventional name of `key` moved by `delta` semitones, or null for an unreadable key. */
export function shiftedKeyName(key: string | undefined, delta: number): string | null {
  const pitch = keyPitch(key);
  if (pitch === null || !key) return null;
  const index = (((pitch + delta) % 12) + 12) % 12;
  return (isMinorKey(key) ? MINOR_KEYS : MAJOR_KEYS)[index];
}

/** Every other key a song in `key` can move to, in pitch order, with the shortest move to it. */
export function keyChoices(key: string | undefined): { key: string; delta: number }[] {
  const pitch = keyPitch(key);
  if (pitch === null) return [];
  return Array.from({ length: 12 }, (_, index) => {
    let delta = (((index - pitch) % 12) + 12) % 12;
    if (delta > 6) delta -= 12;
    return { key: shiftedKeyName(key, delta) ?? "", delta };
  }).filter((choice) => choice.delta !== 0);
}

const keyDirective = /^(\s*\{\s*(?:key|k)\s*:\s*)([^}]*?)(\s*\}\s*)$/i;
const SHARP_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NOTES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
// Root, suffix kept verbatim (it may hold a slash, as in C6/9), and an optional bass note.
const chordParts = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/;

/** Move a chord's root and bass note, spelling naturals as naturals and accidentals for the key. */
function moveChord(chordText: string, delta: number, notes: string[]): string | null {
  const parts = chordParts.exec(chordText);
  if (!parts || !Chord.parse(chordText)) return null;
  const move = (note: string) => notes[((keyPitch(note) ?? 0) + delta + 120) % 12];
  return `${move(parts[1])}${parts[2]}${parts[3] ? `/${move(parts[3])}` : ""}`;
}

/**
 * Move every chord in ChordPro text by `delta` semitones, spelled for `targetKey`, and update
 * {key} directives. Only `[chord]` tokens and key values change, so the rest of the text stays
 * exactly as written. Annotations (`[*...]`), number chords and unreadable chords are kept.
 */
export function transposeChordProText(text: string, delta: number, targetKey: string): string {
  if (delta % 12 === 0) return text;
  const notes = FLAT_KEYS.has(targetKey) ? FLAT_NOTES : SHARP_NOTES;
  return text
    .split("\n")
    .map((line) => {
      const directive = keyDirective.exec(line);
      if (directive) {
        const shifted = shiftedKeyName(directive[2], delta);
        return shifted ? `${directive[1]}${shifted}${directive[3]}` : line;
      }
      return line.replace(/\[([^\]\n]*)\]/g, (token, chordText: string) => {
        const moved = moveChord(chordText.trim(), delta, notes);
        return moved === null ? token : `[${moved}]`;
      });
    })
    .join("\n");
}
