import { useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import type { LibraryWorkspaceContext } from "../components/LibraryWorkspace";
import { createLibrarySearch, tagSearchQuery } from "../utils/librarySearch";
import "./HomePage.scss";

export const HomePage = () => {
  const navigate = useNavigate();
  const {
    songs,
    libraryLoading: loading,
    libraryError,
    refreshLibrary,
    selectCurrentSetlist,
  } = useOutletContext<LibraryWorkspaceContext>();
  const [error, setError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const setQuery = (value: string) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set("q", value);
        else next.delete("q");
        return next;
      },
      { replace: true },
    );
  };
  const visibleSongs = useMemo(() => {
    const matches = createLibrarySearch(query);
    return songs.filter((song) =>
      matches([song.title, song.subtitle ?? "", song.artist, ...song.tags].join(" "), song.tags),
    );
  }, [songs, query]);
  const addDemo = async () => {
    try {
      // Loaded on demand so the chord engine stays out of the start-up bundle.
      const { addDemoLibrary } = await import("../utils/demoSongs");
      const { songId, setlistId } = await addDemoLibrary();
      selectCurrentSetlist(setlistId);
      navigate(`/song/${songId}`);
    } catch {
      setError("Could not add the demo songs. Please try again.");
    }
  };
  return (
    <div className="home-page">
      <main className="home-page__content">
        {error && <p role="alert">{error}</p>}
        {libraryError && (
          <p role="alert">
            {libraryError}{" "}
            <button type="button" onClick={refreshLibrary}>
              Retry
            </button>
          </p>
        )}
        {loading ? (
          <output>Loading songs…</output>
        ) : songs.length ? (
          <>
            <div className="home-page__overview-header">
              <div>
                <h1>Songs</h1>
                <p>{songs.length} in your library</p>
              </div>
            </div>
            <label className="home-page__search-label" htmlFor="library-song-search">
              Search your songs
            </label>
            <input
              id="library-song-search"
              className="home-page__search-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Title, artist, or #tag…"
            />
            {visibleSongs.length ? (
              <ul className="home-page__songs">
                {visibleSongs.map((song) => (
                  <li key={song.id}>
                    <Link to={`/song/${song.id}`}>
                      <strong>{song.title}</strong>
                      {song.artist && <span className="home-page__song-artist">{song.artist}</span>}
                    </Link>
                    {song.tags.length > 0 && (
                      <div className="home-page__song-tags">
                        <div className="home-page__tags-list">
                          {song.tags.map((tag) => {
                            const name = tag.trim().replace(/^#+/, "");
                            return (
                              <button
                                type="button"
                                key={tag}
                                aria-label={`Filter by tag: ${name}`}
                                title={`Filter by #${name}`}
                                onClick={() => setQuery(tagSearchQuery(tag))}
                              >
                                #{name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="home-page__no-results">No songs match your search.</p>
            )}
          </>
        ) : !libraryError ? (
          <div className="home-page__empty">
            <h1>No songs yet</h1>
            <p>Start with three short demo songs that show you around, or bring your own.</p>
            <button type="button" onClick={() => void addDemo()} className="home-page__demo-btn">
              Add demo songs
            </button>
            <div className="home-page__empty-links">
              <Link to="/song/new">Write a new song</Link>
              <Link to="/settings?section=library">Import ChordPro files</Link>
            </div>
          </div>
        ) : null}
      </main>
      <Link to="/song/new" className="home-page__fab" aria-label="Add song">
        +
      </Link>
    </div>
  );
};
