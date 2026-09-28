export interface SongLayout {
  fontSize: number;
  columns: number;
  fits: boolean;
}

/** Search measured browser layouts, maximizing text size, then minimizing columns. */
export function findSongLayout(
  maxColumns: number,
  fits: (fontSize: number, columns: number) => boolean,
  manualFontSize?: number,
  minimumFontSize = 12,
): SongLayout {
  // Column fragmentation is not monotonic: an oversized section can start splitting
  // at a larger size. A descending search avoids binary-search false negatives.
  for (let fontSize = manualFontSize ?? 36; fontSize >= (manualFontSize ?? minimumFontSize); fontSize--) {
    for (let columns = 1; columns <= maxColumns; columns++) {
      if (fits(fontSize, columns)) return { fontSize, columns, fits: true };
    }
  }
  // Readable scrolling is preferable to silently clipping content at the minimum size.
  return { fontSize: manualFontSize ?? Math.max(18, minimumFontSize), columns: 1, fits: false };
}

/** Check every chord/lyric pair, including overflow into implicit extra CSS columns. */
export function songContentFits(content: HTMLElement): boolean {
  const bounds = content.getBoundingClientRect();
  const style = getComputedStyle(content);
  const columns = Number.parseInt(style.columnCount, 10) || 1;
  const columnWidth =
    (bounds.width -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight) -
      (Number.parseFloat(style.columnGap) || 0) * (columns - 1)) /
    columns;
  const bottom = bounds.bottom - Number.parseFloat(style.paddingBottom);
  const right = bounds.right - Number.parseFloat(style.paddingRight);
  return Array.from(content.querySelectorAll<HTMLElement>("table")).every((row) =>
    Array.from(row.getClientRects()).every(
      (rect) =>
        rect.width <= columnWidth + 0.5 &&
        rect.left >= bounds.left - 0.5 &&
        rect.right <= right + 0.5 &&
        rect.top >= bounds.top - 0.5 &&
        rect.bottom <= bottom + 0.5,
    ),
  );
}

/** Cache row nodes and per-size intrinsic bounds during one descending layout search. */
export function createSongFitChecker(content: HTMLElement): () => boolean {
  const rows = Array.from(content.querySelectorAll<HTMLElement>("table"));
  const style = getComputedStyle(content);
  const bounds = content.getBoundingClientRect();
  const paddingLeft = Number.parseFloat(style.paddingLeft);
  const paddingRight = Number.parseFloat(style.paddingRight);
  const paddingBottom = Number.parseFloat(style.paddingBottom);
  const gap = Number.parseFloat(style.columnGap) || 0;
  const availableHeight = bounds.height - Number.parseFloat(style.paddingTop) - paddingBottom;
  const bottom = bounds.bottom - paddingBottom;
  const right = bounds.right - paddingRight;
  let font = "";
  let width = 0;
  let rowHeight = 0;
  return () => {
    const columns = Number.parseInt(content.style.columnCount, 10) || 1;
    // Search visits one column first at every font size. Complete row dimensions
    // rule out impossible candidates before forcing another fragmented layout.
    if (font !== content.style.fontSize) {
      font = content.style.fontSize;
      width = 0;
      rowHeight = 0;
      for (const row of rows) {
        const rect = row.getBoundingClientRect();
        width = Math.max(width, rect.width);
        rowHeight += rect.height;
      }
    }
    const columnWidth = (bounds.width - paddingLeft - paddingRight - gap * (columns - 1)) / columns;
    if (width > columnWidth + 0.5 || rowHeight > availableHeight * columns + 0.5) return false;
    return rows.every((row) =>
      Array.from(row.getClientRects()).every(
        (rect) =>
          rect.width <= columnWidth + 0.5 &&
          rect.left >= bounds.left - 0.5 &&
          rect.right <= right + 0.5 &&
          rect.top >= bounds.top - 0.5 &&
          rect.bottom <= bottom + 0.5,
      ),
    );
  };
}
