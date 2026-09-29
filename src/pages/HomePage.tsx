import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addSetlist, addSong, getAllSongs, LIBRARY_CHANGED_EVENT, type Song } from "../db";
import { DEMO_SETLIST, DEMO_SONG, TUTORIAL_SONG } from "../utils/demoSong";
import { matchesLibrarySearch } from "../utils/librarySearch";
import "./HomePage.scss";

export const HomePage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void getAllSongs()
        .then((library) => {
          if (cancelled) return;
          setSongs(library.sort((a, b) => a.title.localeCompare(b.title)));
          setError("");
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) {
            setLoading(false);
            setError("Could not load your songs. Reload to try again.");
          }
        });
    };
    refresh();
    window.addEventListener(LIBRARY_CHANGED_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(LIBRARY_CHANGED_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const visibleSongs = useMemo(
    () =>
      songs.filter((song) =>
        matchesLibrarySearch([song.title, song.subtitle ?? "", song.artist, ...song.tags].join(" "), song.tags, query),
      ),
    [songs, query],
  );
  const addDemo = async () => {
    try {
      const tutorialId = await addSong({
        title: "Tutorial Song",
        artist: "Gig-Dex Demo",
        content: TUTORIAL_SONG,
        key: "C",
        tempo: 100,
        capo: 2,
        time: "4/4",
        tags: ["demo", "tutorial"],
      });
      const amazingId = await addSong({
        title: "Amazing Grace",
        artist: "Traditional",
        content: DEMO_SONG,
        key: "G",
        tags: ["hymn", "classic", "worship"],
      });
      await addSetlist({
        ...DEMO_SETLIST,
        songIds: [tutorialId, amazingId],
        songSettings: [{ transpose: 0 }, { transpose: 0 }],
      });
      navigate(`/song/${amazingId}`);
    } catch {
      setError("Could not add the songs. Please try again.");
    }
  };
  return (
    <div className="home-page">
      <main className="home-page__content">
        {error && <p role="alert">{error}</p>}
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
              placeholder="Title, artist, or #tag"
            />
            {visibleSongs.length ? (
              <ul className="home-page__songs">
                {visibleSongs.map((song) => (
                  <li key={song.id}>
                    <Link to={`/song/${song.id}`}>
                      <strong>{song.title}</strong>
                      {song.artist && <span>{song.artist}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="home-page__no-results">No songs match your search.</p>
            )}
          </>
        ) : (
          <div className="home-page__empty">
            <h1>No songs yet</h1>
            <p>Add your first song to get started</p>
            <button type="button" onClick={() => void addDemo()} className="home-page__demo-btn">
              Add Demo Songs
            </button>
          </div>
        )}
      </main>
      <Link to="/song/new" className="home-page__fab" aria-label="Add song">
        +
      </Link>
    </div>
  );
};
