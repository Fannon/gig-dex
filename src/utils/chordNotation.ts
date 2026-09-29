/** Convert standard B natural/B flat chord spelling for German display. */
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
