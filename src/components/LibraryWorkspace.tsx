import { type CSSProperties, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  getAllSetlists,
  getAllSongs,
  getSetlist,
  getSong,
  LIBRARY_CHANGED_EVENT,
  type Setlist,
  type Song,
  updateSetlist,
} from "../db";
import { usePwaState } from "../pwa/lifecycle";
import { syncHosts } from "../sync";
import { getSyncConflicts } from "../sync/syncStore";
import { matchesLibrarySearch } from "../utils/librarySearch";
import { defaultSongSetting, occurrenceSettings, settingLabel } from "../utils/setlistSettings";
import { readSongDrag, songDragType, writeSongDrag } from "../utils/songDrag";
import { HighlightedText } from "./HighlightedText";
import "./LibraryWorkspace.scss";

const readPreference = (key: string, fallback = "") => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Optional preferences. */
  }
};

export interface LibraryWorkspaceContext {
  performanceHost: HTMLDivElement | null;
  setPerformanceExit: (url: string | null) => void;
  currentSetlistId: string | undefined;
  currentSetlist: Setlist | undefined;
  setlists: Setlist[];
  songSetCounts: ReadonlyMap<string, number>;
  selectCurrentSetlist: (id: string) => void;
}

export function LibraryWorkspace() {
  const location = useLocation();
  const pwaIssue = !!usePwaState().error;
  const [performanceHost, setPerformanceHost] = useState<HTMLDivElement | null>(null);
  const [performanceExit, setPerformanceExit] = useState<string | null>(null);
  const navigate = useNavigate();
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(readPreference("sidebar-width", "240"));
    return Number.isFinite(saved) ? Math.max(200, Math.min(480, saved)) : 240;
  });
  const resizing = useRef<{ x: number; width: number } | null>(null);
  const widthRef = useRef(sidebarWidth);
  const resizeSidebar = (width: number) => {
    const value = Math.max(200, Math.min(480, width));
    widthRef.current = value;
    setSidebarWidth(value);
  };
  const [songs, setSongs] = useState<Song[]>([]);
  const [lists, setLists] = useState<Setlist[]>([]);
  const [error, setError] = useState("");
  const [syncNeedsAttention, setSyncNeedsAttention] = useState(false);
  const [syncRunning, setSyncRunning] = useState(() => syncHosts.some(({ manager }) => manager.getStatus().isSyncing));
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(
    () => readPreference("sidebar-open", window.matchMedia("(max-width: 800px)").matches ? "false" : "true") === "true",
  );
  const [songsExpanded, setSongsExpanded] = useState(() => readPreference("sidebar-songs", "true") === "true");
  const [listsExpanded, setListsExpanded] = useState(() => readPreference("sidebar-setlist", "true") === "true");
  const [chosen, setChosen] = useState(() => readPreference("sidebar-current-setlist"));
  const [songQuery, setSongQuery] = useState("");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const dragged = useRef<{ songId?: string; index?: number; listId?: string } | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const performance = location.pathname.startsWith("/perform/");
  const refresh = useCallback(() => {
    void Promise.all([getAllSongs(), getAllSetlists()])
      .then(([library, setlists]) => {
        setSongs(library.sort((a, b) => a.title.localeCompare(b.title)));
        setLists(setlists.sort((a, b) => a.name.localeCompare(b.name)));
        setError("");
      })
      .catch(() => setError("Could not load the library. Try again."));
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(LIBRARY_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(LIBRARY_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  useEffect(() => {
    let disposed = false;
    const refreshSyncAttention = () => {
      setSyncRunning(syncHosts.some(({ manager }) => manager.getStatus().isSyncing));
      const statusIssue = syncHosts.some(({ manager }) => {
        const status = manager.getStatus();
        return !!status.error || !!status.conflictCount;
      });
      void getSyncConflicts()
        .then((conflicts) => {
          if (!disposed) setSyncNeedsAttention(statusIssue || conflicts.length > 0);
        })
        .catch(() => {
          if (!disposed) setSyncNeedsAttention(statusIssue);
        });
    };
    refreshSyncAttention();
    window.addEventListener("gigdex-sync-status", refreshSyncAttention);
    window.addEventListener("focus", refreshSyncAttention);
    return () => {
      disposed = true;
      window.removeEventListener("gigdex-sync-status", refreshSyncAttention);
      window.removeEventListener("focus", refreshSyncAttention);
    };
  }, []);
  useEffect(() => {
    const routeList =
      /^\/(?:setlist|perform\/setlist)\/([^/]+)/.exec(location.pathname)?.[1] ??
      (location.pathname.startsWith("/song/") ? new URLSearchParams(location.search).get("setlist") : null);
    if (routeList) {
      setChosen(routeList);
      remember("sidebar-current-setlist", routeList);
    }
    refresh();
  }, [location.pathname, location.search, refresh]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    if (searchOpen) {
      dialog.current?.showModal();
      search.current?.focus();
      search.current?.select();
    } else dialog.current?.close();
  }, [searchOpen]);
  const current = lists.find((list) => list.id === chosen);
  const selectCurrentSetlist = (id: string) => {
    setChosen(id);
    remember("sidebar-current-setlist", id);
    refresh();
  };
  const changeSetlist = async (songId?: string, from?: number, to?: number, remove?: number) => {
    if (!current || busy) return;
    setBusy(true);
    try {
      const latest = await getSetlist(current.id);
      if (!latest) throw new Error("Setlist no longer exists");
      const ids = [...latest.songIds];
      const settings = occurrenceSettings(latest);
      if (songId) {
        const slot = to === undefined ? ids.length : Math.max(0, Math.min(to, ids.length));
        ids.splice(slot, 0, songId);
        const added = await getSong(songId);
        if (!added) throw new Error("Song no longer exists");
        settings.splice(slot, 0, defaultSongSetting(added));
      } else if (remove !== undefined && remove >= 0 && remove < ids.length) {
        ids.splice(remove, 1);
        settings.splice(remove, 1);
      } else if (
        from !== undefined &&
        from >= 0 &&
        from < ids.length &&
        to !== undefined &&
        to >= 0 &&
        to < ids.length
      ) {
        const [id] = ids.splice(from, 1);
        ids.splice(to, 0, id);
        const [setting] = settings.splice(from, 1);
        settings.splice(to, 0, setting);
      }
      await updateSetlist(current.id, { songIds: ids, songSettings: settings });
      const params = new URLSearchParams(location.search);
      if (params.get("setlist") === current.id && params.has("occurrence")) {
        let index = Number(params.get("occurrence"));
        if (remove === index) {
          params.delete("setlist");
          params.delete("occurrence");
        } else {
          if (remove !== undefined && index > remove) index--;
          if (songId && to !== undefined && index >= to) index++;
          if (from !== undefined && to !== undefined) {
            if (index === from) index = to;
            else if (from < index && index <= to) index--;
            else if (to <= index && index < from) index++;
          }
          params.set("occurrence", String(index));
        }
        navigate(`${location.pathname}?${params}`, { replace: true });
      }
      setLists(await getAllSetlists());
    } catch {
      setError("Could not update the setlist. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const finishDrag = () => {
    dragged.current = null;
    setDropSlot(null);
  };
  const drop = (slot: number, external?: ReturnType<typeof readSongDrag>) => {
    const source = external ?? dragged.current;
    finishDrag();
    if (!source || busy || !current) return;
    if (source.listId === current.id && source.index !== undefined) {
      const to = slot > source.index ? slot - 1 : slot;
      if (to !== source.index) void changeSetlist(undefined, source.index, to);
    } else if (source.songId) void changeSetlist(source.songId, undefined, slot);
  };
  const songMap = new Map(songs.map((song) => [song.id, song]));
  const songSetCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const list of lists) for (const id of new Set(list.songIds)) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }, [lists]);
  const filteredSongs = songs.filter((song) =>
    matchesLibrarySearch([song.title, song.subtitle ?? "", song.artist, ...song.tags].join(" "), song.tags, songQuery),
  );
  const results = query.trim()
    ? [
        ...songs
          .filter((song) =>
            matchesLibrarySearch(
              [song.title, song.subtitle ?? "", song.artist, ...song.tags].join(" "),
              song.tags,
              query,
            ),
          )
          .map((song) => ({
            id: song.id,
            label: song.title,
            detail: [song.subtitle, song.artist, ...song.tags.map((tag) => `#${tag.replace(/^#+/, "")}`)]
              .filter(Boolean)
              .join(" · "),
            type: "Song" as const,
            setCount: songSetCounts.get(song.id) ?? 0,
            url: `/song/${song.id}`,
          })),
        ...lists
          .filter((list) =>
            matchesLibrarySearch(
              [list.name, list.date ?? "", list.description ?? "", ...(list.tags ?? [])].join(" "),
              list.tags ?? [],
              query,
              list.songIds,
            ),
          )
          .map((list) => ({
            id: list.id,
            label: list.name,
            detail: [list.date, list.description, ...(list.tags ?? []).map((tag) => `#${tag.replace(/^#+/, "")}`)]
              .filter(Boolean)
              .join(" · "),
            type: "Setlist" as const,
            url: `/setlist/${list.id}`,
          })),
      ]
    : [];
  const go = (url: string) => {
    navigate(url);
    if (window.matchMedia("(max-width: 800px)").matches) setOpen(false);
  };
  return (
    <>
      <header className="workspace-topbar" data-performance={performance}>
        <button
          type="button"
          aria-label="Toggle sidebar"
          aria-controls="library-sidebar"
          aria-expanded={open && !performance}
          onClick={() => {
            if (performance) {
              setOpen(true);
              remember("sidebar-open", "true");
              navigate(
                performanceExit ??
                  location.pathname.replace("/perform/setlist/", "/setlist/").replace("/perform/song/", "/song/"),
              );
              return;
            }
            const value = !open;
            setOpen(value);
            remember("sidebar-open", String(value));
          }}
        >
          ☰
        </button>
        <Link to="/" className="workspace-brand home-page__title">
          Gig-Dex
        </Link>
        <nav aria-label="Main navigation">
          <NavLink to="/" end className={location.pathname.startsWith("/song/") ? "active" : undefined}>
            Songs
          </NavLink>
          <NavLink to="/setlists" className={location.pathname.startsWith("/setlist/") ? "active" : undefined}>
            Sets
          </NavLink>
          <NavLink to={pwaIssue ? "/settings?section=offline" : "/settings"}>
            Settings
            {pwaIssue && (
              <span className="workspace-sync-alert" title="Offline app needs attention">
                !
              </span>
            )}
          </NavLink>
        </nav>
        <Link
          to="/settings?section=sync"
          className="workspace-sync-link"
          data-syncing={syncRunning}
          data-needs-attention={syncNeedsAttention}
          aria-label={
            syncNeedsAttention
              ? "Sync needs attention — open sync settings"
              : syncRunning
                ? "Syncing library — open sync settings"
                : "Sync settings"
          }
          title={syncNeedsAttention ? "Sync needs attention" : syncRunning ? "Syncing library" : "Sync settings"}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 7v5h-5M4 17v-5h5" />
            <path d="M5.7 9A7 7 0 0 1 18 6l2 1M4 17l2 1a7 7 0 0 0 12.3-2" />
          </svg>
          {syncNeedsAttention && (
            <span className="workspace-sync-alert" aria-hidden="true">
              !
            </span>
          )}
        </Link>
        {performance && <div className="workspace-performance" ref={setPerformanceHost} />}
        <button className="workspace-search-button" type="button" onClick={() => setSearchOpen(true)}>
          Search songs & setlists <kbd>Ctrl+K</kbd>
        </button>
      </header>
      <div
        className="workspace-body"
        data-sidebar={open && !performance}
        style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      >
        {open && !performance && (
          <>
            <button
              className="workspace-backdrop"
              type="button"
              aria-label="Close sidebar"
              onClick={() => setOpen(false)}
            />
            <aside id="library-sidebar" className="library-sidebar" aria-label="Library sidebar">
              {error && (
                <p role="alert">
                  {error}{" "}
                  <button type="button" onClick={refresh}>
                    Retry
                  </button>
                </p>
              )}
              <section className="library-sidebar__section" data-expanded={songsExpanded}>
                <div className="library-sidebar__heading-row">
                  <button
                    className="library-sidebar__heading"
                    type="button"
                    aria-expanded={songsExpanded}
                    aria-controls="sidebar-songs"
                    onClick={() => {
                      setSongsExpanded(!songsExpanded);
                      remember("sidebar-songs", String(!songsExpanded));
                    }}
                  >
                    Songs{" "}
                    <span>
                      {songs.length} {songsExpanded ? "▾" : "▸"}
                    </span>
                  </button>
                  <Link to="/song/new" className="library-sidebar__add" aria-label="Add song" title="Add song">
                    +
                  </Link>
                </div>
                {songsExpanded && (
                  <div id="sidebar-songs" className="library-sidebar__panel">
                    <input
                      aria-label="Search sidebar songs"
                      placeholder="Song, artist or tag…"
                      value={songQuery}
                      onChange={(event) => setSongQuery(event.target.value)}
                    />
                    <div className="library-sidebar__links">
                      {filteredSongs.map((song) => (
                        <div key={song.id} className="library-sidebar__song-row">
                          <Link
                            to={`/song/${song.id}`}
                            draggable={!busy}
                            onDragStart={(event) => {
                              dragged.current = { songId: song.id };
                              writeSongDrag(event, { songId: song.id }, song.title);
                            }}
                            onDragEnd={finishDrag}
                            aria-current={location.pathname === `/song/${song.id}` ? "page" : undefined}
                            onClick={() => {
                              if (window.matchMedia("(max-width: 800px)").matches) setOpen(false);
                            }}
                          >
                            <strong>{song.title}</strong>
                            <small>{[song.subtitle, song.artist].filter(Boolean).join(" · ")}</small>
                          </Link>
                        </div>
                      ))}
                      {!filteredSongs.length && <p>{songs.length ? "No matching songs" : "No songs yet"}</p>}
                    </div>
                  </div>
                )}
              </section>
              <section className="library-sidebar__section" data-expanded={listsExpanded}>
                <button
                  className="library-sidebar__heading"
                  type="button"
                  aria-expanded={listsExpanded}
                  aria-controls="sidebar-setlist"
                  onClick={() => {
                    setListsExpanded(!listsExpanded);
                    remember("sidebar-setlist", String(!listsExpanded));
                  }}
                >
                  <span title={current?.name}>Setlist: {current?.name ?? "None selected"}</span>{" "}
                  <span>{listsExpanded ? "▾" : "▸"}</span>
                </button>
                {listsExpanded && (
                  // biome-ignore lint/a11y/noStaticElementInteractions: Adding is available through Add to Set; Alt+arrows reorder entries.
                  <div
                    id="sidebar-setlist"
                    className="library-sidebar__panel"
                    data-drop-end={dropSlot === current?.songIds.length}
                    onDragOver={(event) => {
                      if ((!dragged.current && !event.dataTransfer.types.includes(songDragType)) || !current || busy)
                        return;
                      event.preventDefault();
                      setDropSlot(current.songIds.length);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (current) drop(current.songIds.length, readSongDrag(event));
                    }}
                  >
                    {current ? (
                      <div className="library-sidebar__links">
                        {current.songIds.map((id, index) => (
                          // biome-ignore lint/a11y/noStaticElementInteractions: Alt+arrows reorder entries with the keyboard.
                          <div
                            // biome-ignore lint/suspicious/noArrayIndexKey: Rows represent ordered occurrences.
                            key={`${id}:${index}`}
                            data-drop-before={dropSlot === index}
                            data-drop-after={index === current.songIds.length - 1 && dropSlot === index + 1}
                            onDragOver={(event) => {
                              if ((!dragged.current && !event.dataTransfer.types.includes(songDragType)) || busy)
                                return;
                              event.preventDefault();
                              event.stopPropagation();
                              const box = event.currentTarget.getBoundingClientRect();
                              setDropSlot(index + (event.clientY > box.y + box.height / 2 ? 1 : 0));
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              drop(dropSlot ?? index, readSongDrag(event));
                            }}
                            className="library-sidebar__song-row"
                          >
                            <Link
                              to={`/song/${id}?setlist=${current.id}&occurrence=${index}`}
                              draggable={!busy}
                              onDragStart={(event) => {
                                dragged.current = { index, listId: current.id };
                                writeSongDrag(
                                  event,
                                  { songId: id, index, listId: current.id },
                                  songMap.get(id)?.title ?? "Song",
                                );
                              }}
                              onDragEnd={finishDrag}
                              title="Drag to reorder; Alt+Up/Down moves, Alt+Delete removes this entry"
                              aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+Delete"
                              onKeyDown={(event) => {
                                if (event.altKey && event.key === "Delete") {
                                  event.preventDefault();
                                  void changeSetlist(undefined, undefined, undefined, index);
                                }
                                const delta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
                                if (event.altKey && delta) {
                                  event.preventDefault();
                                  void changeSetlist(undefined, index, index + delta);
                                }
                              }}
                              onClick={() => {
                                if (window.matchMedia("(max-width: 800px)").matches) setOpen(false);
                              }}
                            >
                              <strong>
                                {index + 1}. {songMap.get(id)?.title ?? "Missing song"}
                              </strong>
                              <small>{settingLabel(songMap.get(id), current.songSettings?.[index])}</small>
                            </Link>
                          </div>
                        ))}
                        {!current.songIds.length && <p>Drag songs here or use Add to Set.</p>}
                        <div className="library-sidebar__drop-end" data-active={dropSlot === current.songIds.length}>
                          Drop here to append
                        </div>
                        {/* biome-ignore lint/a11y/noStaticElementInteractions: Alt+Delete on an entry provides a keyboard alternative. */}
                        <div
                          className="library-sidebar__drop-remove"
                          data-active={dropSlot === -1}
                          onDragOver={(event) => {
                            if ((!dragged.current && !event.dataTransfer.types.includes(songDragType)) || busy) return;
                            event.preventDefault();
                            event.stopPropagation();
                            setDropSlot(-1);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const source = readSongDrag(event);
                            finishDrag();
                            if (
                              source?.listId === current.id &&
                              source.index !== undefined &&
                              current.songIds[source.index] === source.songId
                            )
                              void changeSetlist(undefined, undefined, undefined, source.index);
                          }}
                        >
                          Drop here to remove
                        </div>
                      </div>
                    ) : (
                      <Link
                        to="/setlists"
                        className="library-sidebar__action"
                        onClick={() => {
                          if (window.matchMedia("(max-width: 800px)").matches) setOpen(false);
                        }}
                      >
                        Select a setlist
                      </Link>
                    )}
                  </div>
                )}
              </section>
            </aside>
            {/* biome-ignore lint/a11y/useSemanticElements: Pointer and keyboard resize handle. */}
            <div
              className="workspace-sidebar-resize"
              role="separator"
              aria-label="Resize sidebar"
              aria-orientation="vertical"
              aria-controls="library-sidebar"
              aria-valuemin={200}
              aria-valuemax={480}
              aria-valuenow={sidebarWidth}
              tabIndex={0}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                resizing.current = { x: event.clientX, width: sidebarWidth };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (resizing.current) resizeSidebar(resizing.current.width + event.clientX - resizing.current.x);
              }}
              onLostPointerCapture={() => {
                resizing.current = null;
                remember("sidebar-width", String(widthRef.current));
              }}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowLeft"
                    ? sidebarWidth - 10
                    : event.key === "ArrowRight"
                      ? sidebarWidth + 10
                      : event.key === "Home"
                        ? 200
                        : event.key === "End"
                          ? 480
                          : undefined;
                if (next === undefined) return;
                event.preventDefault();
                resizeSidebar(next);
                remember("sidebar-width", String(widthRef.current));
              }}
            />
          </>
        )}
        <div className="app-route">
          <Suspense
            fallback={
              <div className="app-loading">
                <output>Loading…</output>
              </div>
            }
          >
            <Outlet
              context={
                {
                  performanceHost,
                  setPerformanceExit,
                  currentSetlistId: current?.id,
                  currentSetlist: current,
                  setlists: lists,
                  songSetCounts,
                  selectCurrentSetlist,
                } satisfies LibraryWorkspaceContext
              }
            />
          </Suspense>
        </div>
      </div>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Native dialog Escape and the close button provide keyboard dismissal. */}
      <dialog
        ref={dialog}
        className="workspace-search"
        aria-label="Search library"
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            setSearchOpen(false);
        }}
        onCancel={(event) => {
          event.preventDefault();
          setSearchOpen(false);
        }}
      >
        <header>
          <h2>Search library</h2>
          <button type="button" aria-label="Close search" onClick={() => setSearchOpen(false)}>
            ×
          </button>
        </header>
        <input
          ref={search}
          aria-label="Search songs and setlists"
          placeholder="Title, artist, or #tag…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              dialog.current?.querySelector<HTMLAnchorElement>(".workspace-search__results a")?.focus();
            }
            if (event.key === "Enter" && results[0]) {
              setSearchOpen(false);
              go(results[0].url);
            }
          }}
        />
        <output>
          {query.trim() ? `${results.length} results` : "Search songs and setlists by title, artist, date or tags"}
        </output>
        <div className="workspace-search__results">
          {results.map((result) => (
            <Link
              key={`${result.type}:${result.id}`}
              to={result.url}
              onClick={() => {
                setSearchOpen(false);
                if (window.matchMedia("(max-width: 800px)").matches) setOpen(false);
              }}
            >
              <span className="workspace-search__type" data-type={result.type}>
                {result.type}
              </span>
              <span>
                <strong>
                  <HighlightedText text={result.label} query={query} />
                </strong>
                <small>
                  <HighlightedText text={result.detail} query={query} />
                </small>
              </span>
              {result.type === "Song" && <span className="workspace-search__set-count">In {result.setCount} Sets</span>}
            </Link>
          ))}
          {!!query.trim() && !results.length && <p>No matches. Try another title or tag.</p>}
        </div>
      </dialog>
    </>
  );
}
