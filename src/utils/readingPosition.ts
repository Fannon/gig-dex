export function contentSignature(content: string) {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index++) hash = Math.imul(hash ^ content.charCodeAt(index), 16777619);
  return `${content.length}:${hash >>> 0}`;
}
/** Overlap the last complete visual line; never jump over text or split the only route to it. */
export function readingPages(height: number, total: number, lineStarts: number[]) {
  if (height <= 0 || total <= height) return [0];
  const starts = [...new Set(lineStarts.filter((n) => n > 0 && n < total).map(Math.round))].sort((a, b) => a - b);
  const pages = [0];
  const last = Math.max(0, total - height);
  while (pages[pages.length - 1] < last) {
    const current = pages[pages.length - 1];
    const boundary = current + height - 8;
    const candidates = starts.filter((n) => n > current + height * 0.5 && n <= boundary);
    const endAnchor = starts.find((start) => start >= last && start > current && start <= boundary);
    const next = endAnchor ?? candidates.at(-1) ?? Math.min(last, current + Math.max(1, height - 32));
    if (next <= current) break;
    pages.push(next);
  }
  return pages;
}
