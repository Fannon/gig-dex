/** Chordle records carry their source notation explicitly. Standard ChordPro
 * spells B natural as B and B flat as Bb. */
export const hasGermanChordleNotation = (content: string) =>
  /^\s*\{x_chordle_notation:\s*German\s*\}\s*$/im.test(content);

export function germanToStandardChord(chord: string): string {
  return chord
    .split("/")
    .map((part) => {
      if (part.startsWith("H")) return `B${part.slice(1)}`;
      if (part.startsWith("B") && !part.startsWith("Bb")) return `Bb${part.slice(1)}`;
      return part;
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
  if (german) {
    cleaned = cleaned.replace(/\[([^\]\n]+)\]/g, (_match, chord: string) => `[${germanToStandardChord(chord)}]`);
    cleaned = cleaned.replace(
      /^(\s*\{key:\s*)([^}]+)(\}\s*)$/gim,
      (_match, open: string, key: string, close: string) => `${open}${germanToStandardChord(key.trim())}${close}`,
    );
  }
  return cleaned;
}
