import {
  Chord,
  ChordLyricsPair,
  ChordProFormatter,
  ChordProParser,
  ChordsOverWordsFormatter,
  ChordsOverWordsParser,
  HtmlTableFormatter,
  Tag,
} from "chordsheetjs";
import { standardToGermanChord } from "./chordNotation";
import { colorSongSections, simpleSectionLabel, songSection } from "./songSections";

export interface ParsedSong {
  title: string | null;
  artist: string | null;
  key: string | null;
  tempo: string | null;
  html: string;
}

export type ChordMode = "standard" | "german" | "nashville" | "roman";

const SUPERSCRIPTS: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  m: "ᵐ",
  M: "ᴹ",
};

/**
 * Parse a ChordPro formatted string and return structured data
 */
const escapeHtmlText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const decodeHtmlText = (text: string) =>
  text.replace(/&(amp|lt|gt);/g, (_, entity: string) => ({ amp: "&", lt: "<", gt: ">" })[entity] ?? "");

/** Only formatter-owned structural markup and classes may enter the live DOM. */
function safeFormattedHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  const allowed = new Set(["DIV", "TABLE", "TBODY", "TR", "TD", "H1", "H2", "H3", "BR", "SPAN"]);
  for (const element of template.content.querySelectorAll("*")) {
    if (!allowed.has(element.tagName)) {
      element.replaceWith(document.createTextNode(element.textContent ?? ""));
      continue;
    }
    for (const attribute of Array.from(element.attributes))
      if (attribute.name !== "class") element.removeAttribute(attribute.name);
  }
  return template.innerHTML;
}

export const parseChordPro = (chordProText: string, options: { mode?: ChordMode } = {}): ParsedSong => {
  const { mode = "standard" } = options;
  const parser = new ChordProParser();
  const song = parser.parse(escapeHtmlText(chordProText));

  // Convert notation if requested
  if (mode === "german") {
    for (const line of song.lines) {
      for (const item of line.items) {
        if ("chords" in item && typeof item.chords === "string" && item.chords)
          item.chords = standardToGermanChord(item.chords);
      }
    }
  } else if (mode !== "standard" && song.key) {
    const songKey = song.key.toString();
    for (const line of song.lines) {
      for (const item of line.items) {
        if ("chords" in item && typeof item.chords === "string" && item.chords) {
          const chord = Chord.parse(item.chords);
          if (chord) {
            let converted: Chord | null = null;
            if (mode === "nashville") {
              converted = chord.toNumeric(songKey);
            } else if (mode === "roman") {
              converted = chord.toNumeral(songKey);
            }

            if (converted) {
              const root = converted.root?.toString() || "";
              const suffix = converted.suffix || "";
              const bass = converted.bass ? `/${converted.bass.toString()}` : "";
              const formattedSuffix = suffix.replace(/[0-9m]/g, (m: string) => SUPERSCRIPTS[m] || m);
              item.chords = `${root}${formattedSuffix}${bass}`;
            }
          }
        }
      }
    }
  }

  // Use HtmlTableFormatter for better chord positioning
  const formatter = new HtmlTableFormatter();
  const html = colorSongSections(safeFormattedHtml(formatter.format(song)));

  // Handle artist which can be string, string[], or null
  let artist: string | null = null;
  if (song.artist) {
    artist = Array.isArray(song.artist) ? song.artist[0] || null : song.artist;
  }

  return {
    title: song.title ? decodeHtmlText(song.title) : null,
    artist: artist ? decodeHtmlText(artist) : null,
    key: song.key ? (mode === "german" ? standardToGermanChord(song.key.toString()) : song.key.toString()) : null,
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

const simpleChordToken = (token: string) =>
  /^[A-G](?:#|b)?(?:maj|min|m|M(?:aj)?|dim|aug|sus|add|no|omit|Δ|°|ø|[0-9b#()+-])*(?:\/[A-G](?:#|b)?)?$/.test(token) &&
  !!Chord.parse(token);
const simpleChordLine = (line: string) => {
  const tokens = line.trim().split(/\s+/);
  return (
    !!line.trim() &&
    tokens.some(simpleChordToken) &&
    tokens.every((token) => token === "|" || token === "||" || simpleChordToken(token))
  );
};

/** Keep lyric indentation, one blank paragraph break, and tight instrumental runs. */
export function normalizeSimpleSpacing(text: string) {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());
  const output: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line) {
      output.push(line);
      continue;
    }
    let nextIndex = index + 1;
    while (nextIndex < lines.length && !lines[nextIndex]) nextIndex++;
    const previous = output.at(-1) ?? "";
    const next = lines[nextIndex] ?? "";
    if (previous && next && !simpleSectionLabel(previous) && !(simpleChordLine(previous) && simpleChordLine(next)))
      output.push("");
    index = nextIndex - 1;
  }
  return output.join("\n");
}

// The chords-over-words formatter drops or moves most directives. Wrap each
// standalone directive in a marked comment so it comes back verbatim, in place.
const directiveMarker = "\uE000";
const standaloneDirective = /^\s*\{\s*([a-z_]+)[^{}]*\}\s*$/i;
const commentDirective = /^\s*\{\s*(?:c|comment|ci|comment_italic|cb|comment_box)\s*:\s*(.*?)\s*\}\s*$/i;
const sectionStart = /^\s*\{\s*(?:start_of_(verse|chorus|bridge)|so([vcb]))\s*(?::\s*(.*?))?\s*\}\s*$/i;
const sectionEnd = /^\s*\{\s*(?:end_of_(?:verse|chorus|bridge)|eo[vcb])\s*\}\s*$/i;
const defaultSectionLabels: Record<string, string> = { v: "Verse", c: "Chorus", b: "Bridge" };
const hideBraces = (text: string) => text.replace(/\{/g, "\uE001").replace(/\}/g, "\uE002");
const showBraces = (text: string) => text.replace(/\uE001/g, "{").replace(/\uE002/g, "}");

/** A line the simple editor reads as a section label, written bracketed when the label is unusual. */
function simpleLabelLine(label: string) {
  return simpleSectionLabel(label) === label ? label : `[${label}]`;
}
/** Simple-editor label lines: known section names, or any bracketed text that is not a chord. */
function readSimpleLabel(line: string): string | null {
  const known = simpleSectionLabel(line);
  if (known) return known;
  const bracketed = /^\s*\[([^[\]]*[^[\]\s][^[\]]*)\]\s*$/.exec(line)?.[1].trim();
  return bracketed && !Chord.parse(bracketed) ? bracketed : null;
}
const sectionEnvironment = (label: string) => {
  const section = songSection(label);
  return section === "chorus" || section === "bridge" ? section : "verse";
};

// ChordsOverWordsParser reads any line starting with these words as a comment,
// detaching lyrics such as "Bridge over…" from their chords. While parsing, the
// first letter becomes a same-width private-use stand-in.
const parserSectionPrefix = /^(\s*)(verse|chorus|bridge|tag|interlude|instrumental|intro)/i;
const parserHeading = /^\s*(?:verse|chorus|bridge|tag|interlude|instrumental|intro)\s*\d*\s*:/i;
const shieldOffset = 0xe000;
const shieldLyric = (line: string) =>
  parserHeading.test(line)
    ? line
    : line.replace(
        parserSectionPrefix,
        (_, space: string, word: string) =>
          `${space}${String.fromCharCode(shieldOffset + word.charCodeAt(0))}${word.slice(1)}`,
      );
const unshieldLyrics = (text: string) =>
  text.replace(/[\uE041-\uE05A\uE061-\uE07A]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) - shieldOffset));

/**
 * Convert ChordPro to simple "chords over words" format
 * This is for the simple editor mode where chords appear on lines above lyrics
 */
export const chordProToSimple = (chordProText: string): string => {
  const marked = chordProText
    .split("\n")
    .map((line) => {
      const start = sectionStart.exec(line);
      if (start) {
        const type = (start[1] ?? start[2]).charAt(0).toLowerCase();
        const label = start[3] || defaultSectionLabels[type];
        // Mark the label so it is written as an editable label line.
        return `{comment: ${directiveMarker}${hideBraces(simpleLabelLine(label))}}`;
      }
      if (sectionEnd.test(line)) return "";
      const comment = commentDirective.exec(line);
      // Section-like comments from older imports become real section labels.
      if (comment && simpleSectionLabel(comment[1])) return line;
      if (standaloneDirective.test(line)) return `{comment: ${directiveMarker}${hideBraces(line.trim())}}`;
      return line;
    })
    .join("\n");
  const parser = new ChordProParser();
  const song = parser.parse(marked);
  const formatter = new ChordsOverWordsFormatter({ normalizeChords: false });
  return normalizeSimpleSpacing(
    formatter
      .format(song)
      .split("\n")
      .map((line) => (line.startsWith(directiveMarker) ? showBraces(line.slice(1)) : line))
      .join("\n"),
  );
};

/**
 * Convert simple "chords over words" format to ChordPro
 * Parses the visual format and converts to ChordPro syntax
 */
export const simpleToChordPro = (simpleText: string): string => {
  if (!simpleText.trim()) return ""; // ChordsOverWordsParser rejects empty input.
  const parser = new ChordsOverWordsParser();
  const lines = normalizeSimpleSpacing(simpleText).split("\n");

  let openSection: string | null = null;
  const closeSection = () => {
    if (openSection) prepared.push(`{end_of_${openSection}}`);
    openSection = null;
  };
  const prepared: string[] = [];
  for (const [index, line] of lines.entries()) {
    const label = readSimpleLabel(line);
    if (label) {
      closeSection();
      openSection = sectionEnvironment(label);
      prepared.push(`{start_of_${openSection}: ${label}}`);
    } else if (/^\s*\{\s*(?:start_of_|so[a-z]\b|chorus\b)/i.test(line)) {
      // Other environments (tab, grid, …) and chorus repeats stand outside sections.
      closeSection();
      prepared.push(line);
    } else {
      const next = lines[index + 1] ?? "";
      // Standalone instrumental lines need explicit spacing; chord-over-lyric
      // lines still go through the parser to preserve their column positions.
      const standalone =
        simpleChordLine(line) &&
        (!next.trim() || !!readSimpleLabel(next) || simpleChordLine(next) || /^\s*\{/.test(next));
      prepared.push(
        standalone ? line.replace(/\S+/g, (token) => (Chord.parse(token) ? `[${token}]` : token)) : shieldLyric(line),
      );
    }
  }
  closeSection();
  const song = parser.parse(prepared.join("\n"));
  const formatter = new ChordProFormatter({ normalizeChords: false });
  return unshieldLyrics(formatter.format(song));
};

/** Comparable outline of a song: labels, directives, chords and lyrics, ignoring layout and section types. */
function songOutline(chordProText: string): string[] {
  const song = new ChordProParser().parse(chordProText);
  const outline: string[] = [];
  for (const line of song.lines) {
    const parts: string[] = [];
    for (const item of line.items) {
      if (item instanceof ChordLyricsPair) {
        if (item.annotation) parts.push(`*${item.annotation}`);
        if (item.chords) parts.push(`[${item.chords}]`);
        if (item.lyrics) parts.push(item.lyrics);
      } else if (item instanceof Tag) {
        const start = /^(?:start_of_(verse|chorus|bridge)|so([vcb]))$/.exec(item.name);
        if (start) parts.push(`§${item.value || defaultSectionLabels[(start[1] ?? start[2]).charAt(0)]}`);
        else if (!/^(?:end_of_(?:verse|chorus|bridge)|eo[vcb])$/.test(item.name))
          parts.push(`{${item.name}:${item.value ?? ""}}`);
      } else if ("string" in item && typeof item.string === "string") parts.push(item.string);
    }
    const text = parts.join(" ").replace(/\s+/g, " ").trim();
    if (text) outline.push(text);
  }
  return outline;
}

/**
 * Describe what saving from the simple editor would change in this ChordPro
 * text. An empty list means the simple editor keeps the song intact.
 */
export function simpleEditorChanges(chordProText: string): string[] {
  const body = stripMetadata(chordProText);
  if (!body.trim()) return [];
  let before: string[];
  try {
    before = songOutline(body);
  } catch {
    return []; // Invalid ChordPro is repaired in either editor.
  }
  let after: string[];
  try {
    after = songOutline(simpleToChordPro(chordProToSimple(body)));
  } catch {
    return ["the song could not be converted"];
  }
  if (before.join("\n") === after.join("\n")) return [];
  const reasons = new Set<string>();
  if (/\{\s*(?:start_of_(?:tab|grid)|so[tg])\b/i.test(body)) reasons.add("tab or grid blocks");
  if (/\[\*/.test(body)) reasons.add("annotations such as [*Rit.]");
  const chords = (lines: string[]) => lines.flatMap((line) => line.match(/\[[^\]]*\]/g) ?? []).join(" ");
  if (chords(before) !== chords(after)) reasons.add("some chords");
  if (!reasons.size) reasons.add("some ChordPro formatting");
  return [...reasons];
}

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
  time?: string;
  // Extended metadata (preserved but not in simple forms)
  capo?: number; // Legacy directive from imports; kept in the text, never shown
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
  let song: ReturnType<typeof parser.parse>;
  try {
    song = parser.parse(chordProText);
  } catch {
    // Broken lyric/chord markup must not prevent metadata preservation or repair.
    song = parser.parse(
      chordProText
        .split("\n")
        .filter((line) => /^\s*\{[^{}]*\}\s*$/.test(line))
        .join("\n"),
    );
  }

  let artist: string | undefined;
  if (song.artist) {
    artist = Array.isArray(song.artist) ? song.artist[0] : song.artist;
  }

  const getNum = (key: string): number | undefined => {
    const val = song.metadata.getSingle(key);
    const number = val ? Number.parseInt(val, 10) : NaN;
    return Number.isFinite(number) ? number : undefined;
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
const metadataDirective =
  /^\s*\{\s*(title|t|subtitle|st|artist|composer|lyricist|copyright|album|year|key|tempo|capo|time|duration)\s*:.*\}\s*$/i;
// Key, tempo and time can change mid-song; only their header copies belong to the form.
const musicalChanges = new Set(["key", "tempo", "time"]);

export const stripMetadata = (chordProText: string): string => {
  let inHeader = true;
  const kept = chordProText.split("\n").filter((line) => {
    const directive = metadataDirective.exec(line);
    if (directive) return !inHeader && musicalChanges.has(directive[1].toLowerCase());
    if (line.trim() && !standaloneDirective.test(line)) inHeader = false;
    return true;
  });
  // Clean up excessive blank lines at the start
  return kept.join("\n").replace(/^\n+/, "");
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
