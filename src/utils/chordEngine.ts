import ChordSheetJS from 'chordsheetjs';

const { ChordProParser, HtmlTableFormatter, TextFormatter, ChordProFormatter } = ChordSheetJS;

export interface ParsedSong {
  title: string | null;
  artist: string | null;
  key: string | null;
  tempo: string | null;
  html: string;
}

/**
 * Parse a ChordPro formatted string and return structured data
 */
export const parseChordPro = (chordProText: string): ParsedSong => {
  const parser = new ChordProParser();
  const song = parser.parse(chordProText);

  // Use HtmlTableFormatter for better chord positioning
  const formatter = new HtmlTableFormatter();
  const html = formatter.format(song);

  // Handle artist which can be string, string[], or null
  let artist: string | null = null;
  if (song.artist) {
    artist = Array.isArray(song.artist) ? song.artist[0] || null : song.artist;
  }

  return {
    title: song.title || null,
    artist,
    key: song.key?.toString() || null,
    tempo: song.metadata.getSingle('tempo') || null,
    html,
  };
};

/**
 * Transpose a ChordPro song by a number of semitones
 */
export const transposeChordPro = (chordProText: string, semitones: number): string => {
  if (semitones === 0) return chordProText;

  const parser = new ChordProParser();
  const song = parser.parse(chordProText);

  // Transpose the song
  const transposedSong = song.transpose(semitones);

  // Format back to ChordPro
  const formatter = new ChordProFormatter();
  return formatter.format(transposedSong);
};

/**
 * Convert ChordPro to plain text (for copying/sharing)
 */
export const chordProToText = (chordProText: string): string => {
  const parser = new ChordProParser();
  const song = parser.parse(chordProText);
  const formatter = new TextFormatter();
  return formatter.format(song);
};

/**
 * Get the current key of a song
 */
export const getSongKey = (chordProText: string): string | null => {
  const parser = new ChordProParser();
  const song = parser.parse(chordProText);
  return song.key?.toString() || null;
};

/**
 * List of all musical keys for transposition UI
 */
export const MUSICAL_KEYS = [
  'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'
];

/**
 * Get the semitone difference between two keys
 */
export const getSemitoneDifference = (fromKey: string, toKey: string): number => {
  const keyValues: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
    'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
  };

  const from = keyValues[fromKey];
  const to = keyValues[toKey];

  if (from === undefined || to === undefined) return 0;

  let diff = to - from;
  if (diff > 6) diff -= 12;
  if (diff < -6) diff += 12;

  return diff;
};

/**
 * Example ChordPro song for demo purposes
 */
export const DEMO_SONG = `{title: Amazing Grace}
{artist: Traditional}
{key: G}
{tempo: 72}

{start_of_verse: Verse 1}
[G]Amazing [G7]grace, how [C]sweet the [G]sound
That [G]saved a [Em]wretch like [D]me
[G]I once [G7]was lost, but [C]now am [G]found
Was [G]blind but [D]now I [G]see
{end_of_verse}

{start_of_verse: Verse 2}
[G]'Twas grace [G7]that taught my [C]heart to [G]fear
And [G]grace my [Em]fears re[D]lieved
[G]How pre[G7]cious did that [C]grace ap[G]pear
The [G]hour I [D]first be[G]lieved
{end_of_verse}

{start_of_verse: Verse 3}
[G]Through many [G7]dangers, [C]toils and [G]snares
I [G]have al[Em]ready [D]come
[G]'Tis grace [G7]hath brought me [C]safe thus [G]far
And [G]grace will [D]lead me [G]home
{end_of_verse}`;
