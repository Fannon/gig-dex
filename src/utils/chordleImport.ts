/** Chordle records carry their source notation explicitly. Standard ChordPro
 * spells B natural as B and B flat as Bb. */
export const hasGermanChordleNotation = (content: string) =>
  /^\s*\{x_chordle_notation:\s*German\s*\}\s*$/im.test(content);

/** H and -is sharps are unambiguously German, even in files marked Standard.
 * Bare B is ambiguous without the explicit German marker, so leave it alone. */
const germanSharpToStandard = (part: string) => {
  const sharp = /^([A-Ga-g])is(.*)$/i.exec(part);
  return sharp ? `${sharp[1].toUpperCase()}#${sharp[2]}` : part;
};
const germanHToStandard = (chord: string) =>
  chord
    .split("/")
    .map((part) => {
      if (part.startsWith("H")) return `B${part.slice(1)}`;
      return germanSharpToStandard(part);
    })
    .join("/");

export function germanToStandardChord(chord: string): string {
  return chord
    .split("/")
    .map((part) => {
      if (part.startsWith("H")) return `B${part.slice(1)}`;
      if (part.startsWith("B") && !part.startsWith("Bb")) return `Bb${part.slice(1)}`;
      return germanSharpToStandard(part);
    })
    .join("/");
}

export function standardToGermanChord(chord: string): string {
  return chord
    .split("/")
    .map((part) => {
      if (part.startsWith("Bb")) return `B${part.slice(2)}`;
      if (part.startsWith("B")) return `H${part.slice(1)}`;
      return part;
    })
    .join("/");
}

export function cleanChordleContent(content: string): string {
  const german = hasGermanChordleNotation(content);
  let cleaned = content.replace(/^\s*\{x_chordle_[^\n}]*\}\s*\n?/gim, "");
  const convert = german ? germanToStandardChord : germanHToStandard;
  cleaned = cleaned.replace(/\[([^\]\n]+)\]/g, (_match, chord: string) => `[${convert(chord)}]`);
  cleaned = cleaned.replace(
    /^(\s*\{key:\s*)([^}]+)(\}\s*)$/gim,
    (_match, open: string, key: string, close: string) => `${open}${convert(key.trim())}${close}`,
  );
  return cleaned;
}

export const standardizeSourceKey = (content: string, key: string) =>
  (hasGermanChordleNotation(content) ? germanToStandardChord : germanHToStandard)(key);

/** Songbook numbers in the copyright directive are reliable source labels. */
export function inferSongbookTags(content: string, copyright = ""): string[] {
  const sources = [copyright, ...[...content.matchAll(/^\s*\{copyright:\s*([^}]+)\}/gim)].map((match) => match[1])];
  const tags = new Set<string>();
  for (const source of sources) {
    for (const match of source.matchAll(/\b(FJ\s*([1-5])|GSB)\s*:\s*\d+/gi)) {
      tags.add(match[2] ? `fj${match[2]}` : "gsb");
    }
  }
  return [...tags];
}
