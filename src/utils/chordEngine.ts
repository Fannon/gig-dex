import ChordSheetJS from "chordsheetjs";

const {
	ChordProParser,
	HtmlTableFormatter,
	TextFormatter,
	ChordProFormatter,
	ChordsOverWordsParser,
	ChordsOverWordsFormatter,
} = ChordSheetJS;

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
		tempo: song.metadata.getSingle("tempo") || null,
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
 * Convert ChordPro to simple "chords over words" format
 * This is for the simple editor mode where chords appear on lines above lyrics
 */
export const chordProToSimple = (chordProText: string): string => {
	const parser = new ChordProParser();
	const song = parser.parse(chordProText);
	const formatter = new ChordsOverWordsFormatter();
	return formatter.format(song);
};

/**
 * Convert simple "chords over words" format to ChordPro
 * Parses the visual format and converts to ChordPro syntax
 */
export const simpleToChordPro = (simpleText: string): string => {
	const parser = new ChordsOverWordsParser();
	const song = parser.parse(simpleText);
	const formatter = new ChordProFormatter();
	return formatter.format(song);
};

/**
 * Metadata that can be extracted from ChordPro
 * Includes ALL standard ChordPro metadata directives
 */
export interface SongMetadata {
	// Primary metadata (shown in simple forms)
	title?: string;
	artist?: string;
	key?: string;
	tempo?: number;
	capo?: number;
	time?: string;
	// Extended metadata (preserved but not in simple forms)
	subtitle?: string;
	composer?: string;
	lyricist?: string;
	copyright?: string;
	album?: string;
	year?: number;
	duration?: string;
}

/**
 * Extract all metadata from ChordPro content
 */
export const extractMetadata = (chordProText: string): SongMetadata => {
	const parser = new ChordProParser();
	const song = parser.parse(chordProText);

	let artist: string | undefined;
	if (song.artist) {
		artist = Array.isArray(song.artist) ? song.artist[0] : song.artist;
	}

	const getNum = (key: string): number | undefined => {
		const val = song.metadata.getSingle(key);
		return val ? parseInt(val, 10) : undefined;
	};

	const getStr = (key: string): string | undefined => {
		return song.metadata.getSingle(key) || undefined;
	};

	return {
		title: song.title || undefined,
		artist,
		key: song.key?.toString() || undefined,
		tempo: getNum("tempo"),
		capo: getNum("capo"),
		time: getStr("time"),
		subtitle: getStr("subtitle"),
		composer: getStr("composer"),
		lyricist: getStr("lyricist"),
		copyright: getStr("copyright"),
		album: getStr("album"),
		year: getNum("year"),
		duration: getStr("duration"),
	};
};

/**
 * Strip metadata directives from ChordPro content, leaving only lyrics/chords
 * This is used for the simple editor to avoid showing metadata in the text
 */
export const stripMetadata = (chordProText: string): string => {
	// List of metadata directive patterns to remove
	const metadataPatterns = [
		/^\s*\{title:.*?\}\s*$/gim,
		/^\s*\{t:.*?\}\s*$/gim,
		/^\s*\{subtitle:.*?\}\s*$/gim,
		/^\s*\{st:.*?\}\s*$/gim,
		/^\s*\{artist:.*?\}\s*$/gim,
		/^\s*\{composer:.*?\}\s*$/gim,
		/^\s*\{lyricist:.*?\}\s*$/gim,
		/^\s*\{copyright:.*?\}\s*$/gim,
		/^\s*\{album:.*?\}\s*$/gim,
		/^\s*\{year:.*?\}\s*$/gim,
		/^\s*\{key:.*?\}\s*$/gim,
		/^\s*\{tempo:.*?\}\s*$/gim,
		/^\s*\{capo:.*?\}\s*$/gim,
		/^\s*\{time:.*?\}\s*$/gim,
		/^\s*\{duration:.*?\}\s*$/gim,
	];

	let result = chordProText;
	for (const pattern of metadataPatterns) {
		result = result.replace(pattern, "");
	}

	// Clean up excessive blank lines at the start
	result = result.replace(/^\n+/, "");

	return result;
};

/**
 * Inject metadata into ChordPro content
 * Adds metadata directives at the beginning of the content
 * Includes ALL metadata fields to preserve extended metadata
 */
export const injectMetadata = (chordProText: string, metadata: SongMetadata): string => {
	const lines: string[] = [];

	// Primary metadata
	if (metadata.title) lines.push(`{title: ${metadata.title}}`);
	if (metadata.subtitle) lines.push(`{subtitle: ${metadata.subtitle}}`);
	if (metadata.artist) lines.push(`{artist: ${metadata.artist}}`);
	if (metadata.composer) lines.push(`{composer: ${metadata.composer}}`);
	if (metadata.lyricist) lines.push(`{lyricist: ${metadata.lyricist}}`);
	if (metadata.copyright) lines.push(`{copyright: ${metadata.copyright}}`);
	if (metadata.album) lines.push(`{album: ${metadata.album}}`);
	if (metadata.year) lines.push(`{year: ${metadata.year}}`);
	if (metadata.key) lines.push(`{key: ${metadata.key}}`);
	if (metadata.tempo) lines.push(`{tempo: ${metadata.tempo}}`);
	if (metadata.capo) lines.push(`{capo: ${metadata.capo}}`);
	if (metadata.time) lines.push(`{time: ${metadata.time}}`);
	if (metadata.duration) lines.push(`{duration: ${metadata.duration}}`);

	if (lines.length > 0) {
		lines.push(""); // Add blank line after metadata
	}

	return lines.join("\n") + chordProText;
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
	"C",
	"C#",
	"Db",
	"D",
	"D#",
	"Eb",
	"E",
	"F",
	"F#",
	"Gb",
	"G",
	"G#",
	"Ab",
	"A",
	"A#",
	"Bb",
	"B",
];

/**
 * Get the semitone difference between two keys
 */
export const getSemitoneDifference = (fromKey: string, toKey: string): number => {
	const keyValues: Record<string, number> = {
		C: 0,
		"C#": 1,
		Db: 1,
		D: 2,
		"D#": 3,
		Eb: 3,
		E: 4,
		F: 5,
		"F#": 6,
		Gb: 6,
		G: 7,
		"G#": 8,
		Ab: 8,
		A: 9,
		"A#": 10,
		Bb: 10,
		B: 11,
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
