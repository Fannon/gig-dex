/** Reflow formatted chord/lyric tables into indivisible words with aligned chord fragments. */
export function readingHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const table of template.content.querySelectorAll("table.row")) {
    const lyrics = Array.from(table.querySelectorAll<HTMLElement>("td.lyrics"));
    if (!lyrics.length) continue;
    const chords = Array.from(table.querySelectorAll<HTMLElement>("td.chord"));
    let position = 0;
    const segments = lyrics.map((cell, index) => {
      const text = cell.textContent ?? "";
      const start = position;
      position += text.length;
      return { text, start, end: position, chord: chords[index]?.textContent ?? "" };
    });
    const text = segments.map((segment) => segment.text).join("");
    const tokens = [...text.matchAll(/\S+\s*|\s+/g)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
    }));
    // Chord-only trailing fragments need their own reachable token.
    if (!tokens.length || segments.some((segment) => segment.start === text.length && segment.chord))
      tokens.push({ start: text.length, end: text.length });
    const line = document.createElement("div");
    line.className = "reading-line";
    for (const token of tokens) {
      const word = document.createElement("span");
      word.className = "chord-word";
      for (const segment of segments) {
        const start = Math.max(token.start, segment.start);
        const end = Math.min(token.end, segment.end);
        const chordHere =
          segment.start >= token.start &&
          (segment.start < token.end || (token.start === token.end && segment.start === token.start));
        if (end <= start && !(chordHere && segment.chord)) continue;
        const fragment = document.createElement("span");
        fragment.className = "chord-fragment";
        if (chords.length) {
          const chord = document.createElement("span");
          chord.className = "chord";
          chord.textContent = chordHere ? segment.chord : "";
          fragment.append(chord);
        }
        const lyric = document.createElement("span");
        lyric.className = "lyrics";
        lyric.textContent = text.slice(start, Math.max(start, end));
        fragment.append(lyric);
        word.append(fragment);
      }
      line.append(word);
    }
    table.replaceWith(line);
  }
  return template.innerHTML;
}
