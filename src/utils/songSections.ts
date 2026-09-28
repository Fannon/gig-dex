export type SongSection = "verse" | "chorus" | "prechorus" | "bridge" | "intro" | "outro" | "instrumental" | "other";
export function songSection(label: string): SongSection {
  const text = label.trim().toLocaleLowerCase();
  if (/^(pre[ -]?(chorus|refrain)|prechorus)/.test(text)) return "prechorus";
  if (/^(chorus|refrain|hook)/.test(text)) return "chorus";
  if (/^(verse|strophe)/.test(text)) return "verse";
  if (/^(bridge|brücke)/.test(text)) return "bridge";
  if (/^(intro|introduction)/.test(text)) return "intro";
  if (/^(outro|ending|coda|schluss|tag)/.test(text)) return "outro";
  if (/^(instrumental|solo|interlude|zwischenspiel)/.test(text)) return "instrumental";
  return "other";
}
/** Recognize complete headings, never a section word inside a lyric sentence. */
export function simpleSectionLabel(line: string): string | null {
  const label = line
    .trim()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/:$/, "")
    .trim();
  return /^(?:intro(?:duction)?|verse|strophe|chorus|refrain|hook|pre[ -]?(?:chorus|refrain)|bridge(?:ge)?|brücke|outro|ending|coda|schluss|tag|instrumental|solo|interlude|zwischenspiel)(?:\s*\d+)?(?:\s+(?:english|deutsch|german))?(?:\s*\(\d+\s*x\))?$/i.test(
    label,
  )
    ? label
    : null;
}
/** Only trusted formatter labels receive category classes; user HTML remains sanitized. */
export function colorSongSections(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const comment of template.content.querySelectorAll(".comment")) {
    if (simpleSectionLabel(comment.textContent ?? "")) {
      comment.classList.remove("comment");
      comment.classList.add("label");
    }
  }
  for (const label of template.content.querySelectorAll(".label"))
    label.classList.add(`section-${songSection(label.textContent ?? "")}`);
  return template.innerHTML;
}
