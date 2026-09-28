import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addSetlist, addSong, getAllSongs } from "../db";
import { DEMO_SETLIST, DEMO_SONG, TUTORIAL_SONG } from "../utils/demoSong";
import "./HomePage.scss";

export const HomePage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void getAllSongs()
      .then((songs) => {
        if (cancelled) return;
        if (songs.length) navigate(`/song/${songs[songs.length - 1].id}`, { replace: true });
        else setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setError("Could not load your songs. Reload to try again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);
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
