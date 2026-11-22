import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getSetlist, getSong, getSongs, type Setlist, type Song } from "../db";
import { useReadingPreferences } from "../hooks/useReadingPreferences";
import { displayCalendarDate } from "../utils/calendarDate";
import { type ChordMode, parseChordPro, transposeChordPro } from "../utils/chordEngine";
import { readingHtml } from "../utils/readingLayout";
import { effectiveTranspose, songSettingDetails } from "../utils/setlistSettings";
import "./PrintPage.scss";

type Contents = "all" | "songs" | "list";
type Orientation = "portrait" | "landscape";
type Paper = "a4" | "letter";
const PAPER_SIZES: Record<Paper, { label: string; css: string; width: number; height: number }> = {
  a4: { label: "A4", css: "A4", width: 210, height: 297 },
  letter: { label: "Letter", css: "letter", width: 215.9, height: 279.4 },
};
const TEXT_SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24] as const;
/** Sizes Auto tries per sheet, largest first; capped so short songs stay a normal size. */
const AUTO_SIZES = TEXT_SIZES.filter((size) => size <= 18).reverse();
const MARGINS = [5, 8, 10, 14, 18, 20, 25] as const;
const COLUMNS = [1, 2, 3, 4] as const;
// Earlier versions saved named sizes.
const NAMED_SIZES: Record<string, number> = { small: 10, medium: 11, large: 13 };
interface PrintPreferences {
  paper: Paper;
  orientation: Orientation;
  /** Page margin in millimetres. */
  margin: number;
  chords: boolean;
  comments: boolean;
  columns: number;
  /** Text size in points, or "auto" to fit each sheet on one page. */
  size: number | "auto";
  contents: Contents;
  /** Print in the chosen transposition (song page or setlist entry) instead of the original key. */
  transposed: boolean;
}
interface PrintEntry {
  song?: Song;
  transpose: number;
}

const PREFERENCES_KEY = "print_preferences";
const defaults: PrintPreferences = {
  paper: "a4",
  orientation: "portrait",
  margin: 10,
  chords: true,
  comments: false,
  columns: 2,
  size: 11,
  contents: "all",
  transposed: true,
};

function savedPrintPreferences(): PrintPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "null") as Partial<PrintPreferences> | null;
    if (!value || typeof value !== "object") return defaults;
    return {
      paper: value.paper === "letter" ? "letter" : "a4",
      orientation: value.orientation === "landscape" ? "landscape" : "portrait",
      margin: MARGINS.find((margin) => margin === value.margin) ?? defaults.margin,
      chords: typeof value.chords === "boolean" ? value.chords : defaults.chords,
      comments: typeof value.comments === "boolean" ? value.comments : defaults.comments,
      columns: COLUMNS.find((columns) => columns === value.columns) ?? defaults.columns,
      size:
        value.size === "auto"
          ? "auto"
          : (TEXT_SIZES.find((size) => size === value.size) ?? NAMED_SIZES[String(value.size)] ?? defaults.size),
      contents: value.contents === "songs" || value.contents === "list" ? value.contents : "all",
      transposed: typeof value.transposed === "boolean" ? value.transposed : defaults.transposed,
    };
  } catch {
    return defaults;
  }
}

function songHtml(content: string, transpose: number, chordMode: ChordMode) {
  try {
    const transposed = transpose === 0 ? content : transposeChordPro(content, transpose);
    // Paper has a fixed width, so long lines always wrap at word boundaries with chords kept above.
    return readingHtml(parseChordPro(transposed, { mode: chordMode }).html);
  } catch {
    return null;
  }
}

function detailLine(song: Song, transpose: number, chordMode: ChordMode) {
  const { key, bpm, time } = songSettingDetails(song, { transpose }, chordMode);
  const hasKey = !!song.key || /\{key:/i.test(song.content);
  // A transposed printout still names the original key, e.g. "Transposed +2 from G".
  const original = hasKey ? ` from ${songSettingDetails(song, { transpose: 0 }, chordMode).key}` : "";
  return [
    hasKey ? `Key ${key}` : "",
    transpose ? `Transposed ${transpose > 0 ? "+" : ""}${transpose}${original}` : "",
    bpm > 0 ? `${bpm} BPM` : "",
    time ?? "",
  ].filter(Boolean);
}

/**
 * Replays how the browser paginates a sheet: verses, song-list rows and headers are never
 * split unless they are taller than a page, and multi-column song bodies fill each page's
 * columns in turn. Heights come from the preview, which is laid out at real paper width.
 * Returns the page count and, for single-column flow, where each new page starts.
 */
function paginate(content: HTMLElement, pageHeight: number, columns: number) {
  let pages = 1;
  let used = 0; // Height used on the current page above the current region.
  const breaks: HTMLElement[] = [];
  const region = (units: HTMLElement[], count: number) => {
    let column = 0;
    let filled = 0;
    let pageTotal = 0;
    let capacity = pageHeight - used;
    const nextColumn = (startsAt?: HTMLElement) => {
      column++;
      filled = 0;
      if (column < count) return;
      pages++;
      column = 0;
      pageTotal = 0;
      used = 0;
      capacity = pageHeight;
      if (count === 1 && startsAt) breaks.push(startsAt);
    };
    const place = (element: HTMLElement) => {
      const height = element.offsetHeight;
      if (!height) return;
      if (filled > 0 && filled + height > capacity) nextColumn(element);
      const parts = Array.from(element.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement && child.offsetHeight > 0,
      );
      // Taller than a whole page: the browser has to split it between its lines.
      if (height > capacity && parts.length > 1) {
        for (const part of parts) place(part);
        return;
      }
      const gap = Number.parseFloat(getComputedStyle(element).marginBottom) || 0;
      filled += height + gap;
      pageTotal += height + gap;
      while (filled - gap > capacity && capacity > 0) {
        const overflow = filled - capacity;
        nextColumn();
        filled = overflow;
        pageTotal = overflow;
      }
    };
    for (const unit of units) place(unit);
    used += count === 1 ? filled : Math.ceil(pageTotal / count);
  };
  for (const child of Array.from(content.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.classList.contains("print-song__body")) {
      const paragraphs = Array.from(child.querySelectorAll<HTMLElement>(".paragraph"));
      region(paragraphs.length ? paragraphs : [child], paragraphs.length ? columns : 1);
    } else if (child.tagName === "OL") region(Array.from(child.children) as HTMLElement[], 1);
    else region([child], 1);
  }
  return { pages, breaks };
}

/**
 * One sheet starts one printed page. It paginates its content against the printable
 * page height to show how many pages it needs and, for single-column content, where
 * each page ends.
 */
function PrintSheet({
  className,
  label,
  columns,
  autoFit,
  children,
}: {
  className: string;
  label: string;
  /** Columns of the song body; break lines are shown only for single-column flow. */
  columns: number;
  /** Pick the largest text size that fits this sheet on one page. */
  autoFit: boolean;
  children: ReactNode;
}) {
  const sheet = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ pages: number; breaks: number[]; size?: number }>({
    pages: 1,
    breaks: [],
  });
  useLayoutEffect(() => {
    const sheetElement = sheet.current;
    const contentElement = content.current;
    const pageElement = page.current;
    if (!sheetElement || !contentElement || !pageElement) return;
    const measure = () => {
      const pageHeight = pageElement.offsetHeight;
      if (!pageHeight || !sheetElement.offsetHeight) return;
      let size: number | undefined;
      let result = paginate(contentElement, pageHeight, columns);
      if (autoFit) {
        const tryFit = (candidate: number) => {
          size = candidate;
          sheetElement.style.fontSize = `${candidate}pt`;
          result = paginate(contentElement, pageHeight, columns);
          return result.pages === 1;
        };
        // A song too long even at the smallest size needs only one measurement; each one lays out
        // the whole sheet. Otherwise try sizes largest first, like the song view's fit-to-screen.
        if (tryFit(AUTO_SIZES[AUTO_SIZES.length - 1])) for (const candidate of AUTO_SIZES) if (tryFit(candidate)) break;
      } else sheetElement.style.fontSize = "";
      // Positions as fractions of the sheet, so they hold at any preview zoom.
      const breaks =
        columns === 1 ? result.breaks.map((element) => (element.offsetTop / sheetElement.offsetHeight) * 100) : [];
      setLayout((previous) =>
        previous.pages === result.pages && previous.size === size && previous.breaks.join() === breaks.join()
          ? previous
          : { pages: result.pages, breaks, size },
      );
    };
    measure();
    // Refit after the layout settles; measuring inside the callback would resize what it observes.
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(contentElement);
    observer.observe(pageElement);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [columns, autoFit]);
  const pageCount = layout.pages === 1 ? "Fits on 1 page" : `${layout.pages} pages`;
  return (
    <section
      className={`print-page__sheet ${className}`}
      aria-label={label}
      data-pages={layout.pages}
      ref={sheet}
      style={autoFit && layout.size ? { fontSize: `${layout.size}pt` } : undefined}
    >
      <div className="print-page__page-height" ref={page} aria-hidden="true" />
      <div ref={content}>{children}</div>
      <span className="print-page__count">
        {autoFit && layout.size ? `${pageCount} at ${layout.size} pt` : pageCount}
      </span>
      {layout.breaks.map((top, index) => (
        <div
          key={top}
          className="print-page__break"
          aria-hidden="true"
          data-page={index + 2}
          style={{ top: `${top}%` }}
        />
      ))}
    </section>
  );
}

function PrintSong({
  entry,
  position,
  chordMode,
  columns,
  autoFit,
}: {
  entry: PrintEntry;
  position?: number;
  chordMode: ChordMode;
  columns: number;
  autoFit: boolean;
}) {
  const { song, transpose } = entry;
  const html = useMemo(
    () => (song ? songHtml(song.content, transpose, chordMode) : null),
    [song, transpose, chordMode],
  );
  const number = position !== undefined && <span className="print-song__number">{position}.</span>;
  if (!song)
    return (
      <PrintSheet className="print-song print-song--missing" label="Missing song" columns={columns} autoFit={autoFit}>
        <header className="print-song__header">
          <h2>{number} Missing song</h2>
        </header>
        <p>This song was deleted from the library.</p>
      </PrintSheet>
    );
  const credits = [song.composer && `Music: ${song.composer}`, song.lyricist && `Lyrics: ${song.lyricist}`].filter(
    Boolean,
  );
  return (
    <PrintSheet className="print-song" label={song.title || "Untitled"} columns={columns} autoFit={autoFit}>
      <header className="print-song__header">
        <h2>
          {number} {song.title || "Untitled"}
        </h2>
        <p className="print-song__meta">
          {[song.artist, ...detailLine(song, transpose, chordMode)].filter(Boolean).join(" · ")}
        </p>
        {credits.length > 0 && <p className="print-song__credits">{credits.join(" · ")}</p>}
      </header>
      {html === null ? (
        <pre className="print-song__raw">{song.content}</pre>
      ) : (
        <div
          className="print-song__body"
          // Sanitized HTML from chord engine
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      {song.copyright && <p className="print-song__copyright">© {song.copyright}</p>}
    </PrintSheet>
  );
}

export const PrintPage = () => {
  const { id, listId } = useParams();
  const [params] = useSearchParams();
  const [{ chordMode }] = useReadingPreferences();
  const [preferences, setPreferences] = useState(savedPrintPreferences);
  const [setlist, setSetlist] = useState<Setlist>();
  const [entries, setEntries] = useState<PrintEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestedTranspose = params.has("transpose") ? Number(params.get("transpose")) : undefined;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      if (listId) {
        const list = await getSetlist(listId);
        if (!list) throw new Error("Setlist not found.");
        const songs = await getSongs(list.songIds);
        if (cancelled) return;
        setSetlist(list);
        setEntries(
          songs.map((song, index) => ({ song, transpose: effectiveTranspose(song, list.songSettings?.[index]) })),
        );
      } else {
        const song = id ? await getSong(id) : undefined;
        if (!song) throw new Error("Song not found.");
        if (cancelled) return;
        const transpose =
          requestedTranspose !== undefined && Number.isInteger(requestedTranspose) && Math.abs(requestedTranspose) <= 24
            ? requestedTranspose
            : (song.defaultTranspose ?? 0);
        setSetlist(undefined);
        setEntries([{ song, transpose }]);
      }
      setLoading(false);
    };
    void load().catch((loadError: Error) => {
      if (cancelled) return;
      setError(loadError.message);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id, listId, requestedTranspose]);

  // The document title becomes the suggested file name for "Save as PDF".
  const documentTitle = setlist?.name ?? entries[0]?.song?.title;
  useEffect(() => {
    if (!documentTitle) return;
    const previous = document.title;
    document.title = documentTitle;
    return () => {
      document.title = previous;
    };
  }, [documentTitle]);

  // Sheets keep the real paper width and are scaled down on narrow screens instead of
  // reflowing, so line wrapping and page counts match the printout.
  const sheetsRef = useRef<HTMLElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Paper size and orientation change the ruler width.
  useLayoutEffect(() => {
    const sheets = sheetsRef.current;
    const ruler = rulerRef.current;
    if (!sheets || !ruler) return;
    const fit = () => {
      const style = getComputedStyle(sheets);
      const available =
        sheets.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
      setZoom(ruler.offsetWidth > 0 ? Math.min(1, available / ruler.offsetWidth) : 1);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(sheets);
    return () => observer.disconnect();
  }, [preferences.paper, preferences.orientation]);

  const update = (changes: Partial<PrintPreferences>) => {
    setPreferences((previous) => {
      const next = { ...previous, ...changes };
      try {
        localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
      } catch {
        /* Preferences still apply for this view. */
      }
      return next;
    });
  };

  const backParams = new URLSearchParams();
  for (const name of ["setlist", "occurrence"]) {
    const value = params.get(name);
    if (value) backParams.set(name, value);
  }
  const back = listId ? `/setlist/${listId}` : `/song/${id}${backParams.size ? `?${backParams}` : ""}`;
  const transposes = entries.some((entry) => entry.transpose !== 0);
  const printed = preferences.transposed ? entries : entries.map((entry) => ({ ...entry, transpose: 0 }));
  const showList = !!setlist && preferences.contents !== "songs";
  const showSongs = !setlist || preferences.contents !== "list";
  const paper = PAPER_SIZES[preferences.paper];
  const autoSize = preferences.size === "auto";
  const landscape = preferences.orientation === "landscape";

  return (
    <div
      className="print-page"
      style={
        {
          fontSize: `${autoSize ? defaults.size : preferences.size}pt`,
          "--print-margin": `${preferences.margin}mm`,
          "--print-columns": preferences.columns,
          "--sheet-width": `${landscape ? paper.height : paper.width}mm`,
          "--sheet-height": `${landscape ? paper.width : paper.height}mm`,
        } as CSSProperties
      }
      data-chords={preferences.chords}
      data-comments={preferences.comments}
    >
      {/* @page cannot be scoped by selectors or use custom properties, so it is injected for this view only. */}
      <style>{`@page { size: ${paper.css} ${preferences.orientation}; margin: ${preferences.margin}mm; }`}</style>
      <div className="print-page__toolbar" role="toolbar" aria-label="Print options">
        <Link to={back}>← Back</Link>
        <label>
          Paper
          <select value={preferences.paper} onChange={(event) => update({ paper: event.target.value as Paper })}>
            {Object.entries(PAPER_SIZES).map(([value, size]) => (
              <option key={value} value={value}>
                {size.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Orientation
          <select
            value={preferences.orientation}
            onChange={(event) => update({ orientation: event.target.value as Orientation })}
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
        <label>
          Margins
          <select value={preferences.margin} onChange={(event) => update({ margin: Number(event.target.value) })}>
            {MARGINS.map((margin) => (
              <option key={margin} value={margin}>
                {margin} mm
              </option>
            ))}
          </select>
        </label>
        <label className="print-page__check">
          <input
            type="checkbox"
            checked={preferences.chords}
            onChange={(event) => update({ chords: event.target.checked })}
          />
          Chords
        </label>
        <label className="print-page__check">
          <input
            type="checkbox"
            checked={preferences.comments}
            onChange={(event) => update({ comments: event.target.checked })}
          />
          Comments
        </label>
        <label>
          Columns
          <select value={preferences.columns} onChange={(event) => update({ columns: Number(event.target.value) })}>
            {COLUMNS.map((columns) => (
              <option key={columns} value={columns}>
                {columns}
              </option>
            ))}
          </select>
        </label>
        <label>
          Text size
          <select
            value={preferences.size}
            onChange={(event) => update({ size: event.target.value === "auto" ? "auto" : Number(event.target.value) })}
          >
            <option value="auto">Auto (fit 1 page)</option>
            {TEXT_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} pt
              </option>
            ))}
          </select>
        </label>
        {transposes && (
          <label>
            Key
            <select
              value={preferences.transposed ? "transposed" : "original"}
              onChange={(event) => update({ transposed: event.target.value === "transposed" })}
            >
              <option value="transposed">As transposed</option>
              <option value="original">Original key</option>
            </select>
          </label>
        )}
        {setlist && (
          <label>
            Song list page
            <select
              value={preferences.contents}
              onChange={(event) => update({ contents: event.target.value as Contents })}
            >
              <option value="all">Include</option>
              <option value="songs">Leave out</option>
              <option value="list">Only the song list</option>
            </select>
          </label>
        )}
        <button
          type="button"
          className="print-page__print"
          disabled={loading || !!error}
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </button>
      </div>
      {/* Every sheet starts a new printed page: the song list and each song. */}
      <main className="print-page__sheets" aria-label="Print preview" ref={sheetsRef}>
        <div className="print-page__ruler" ref={rulerRef} aria-hidden="true" />
        <div className="print-page__zoom" style={{ "--preview-zoom": zoom } as CSSProperties}>
          {error ? (
            <p className="print-page__sheet" role="alert">
              {error}
            </p>
          ) : loading ? (
            <p className="print-page__sheet">Loading…</p>
          ) : (
            <>
              {showList && setlist && (
                <PrintSheet className="print-setlist" label="Song list" columns={1} autoFit={autoSize}>
                  <header className="print-setlist__header">
                    <h1>{setlist.name}</h1>
                    <p>
                      {[
                        setlist.date && displayCalendarDate(setlist.date),
                        `${entries.length} ${entries.length === 1 ? "song" : "songs"}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {setlist.description && <p>{setlist.description}</p>}
                  </header>
                  <ol className="print-setlist__songs">
                    {printed.map(({ song, transpose }, index) => (
                      <li key={index}>
                        <span className="print-setlist__title">{song?.title || "Missing song"}</span>
                        {song && (
                          <span className="print-setlist__details">
                            {detailLine(song, transpose, chordMode).join(" · ")}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </PrintSheet>
              )}
              {showSongs &&
                printed.map((entry, index) => (
                  <PrintSong
                    key={index}
                    entry={entry}
                    position={setlist ? index + 1 : undefined}
                    chordMode={chordMode}
                    columns={preferences.columns}
                    autoFit={autoSize}
                  />
                ))}
              {setlist && entries.length === 0 && showSongs && (
                <p className="print-page__sheet">This setlist has no songs yet.</p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};
