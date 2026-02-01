import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getSetlistWithSongs, updateSetlist, getAllSongs, type Song, type Setlist } from '../db';
import './SetlistDetailPage.scss';

export const SetlistDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [setlist, setSetlist] = useState<Setlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    if (id) {
      loadSetlist(parseInt(id, 10));
      loadAllSongs();
    }
  }, [id]);

  const loadSetlist = async (setlistId: number) => {
    try {
      const result = await getSetlistWithSongs(setlistId);
      if (result) {
        setSetlist(result.setlist);
        setSongs(result.songs);
      } else {
        navigate('/setlists');
      }
    } catch (error) {
      console.error('Failed to load setlist:', error);
      navigate('/setlists');
    } finally {
      setLoading(false);
    }
  };

  const loadAllSongs = async () => {
    const all = await getAllSongs();
    setAllSongs(all);
  };

  const handleAddSong = async (songId: number) => {
    if (!setlist || !setlist.id) return;

    const newSongIds = [...setlist.songIds, songId];
    await updateSetlist(setlist.id, { songIds: newSongIds });
    loadSetlist(setlist.id);
    setShowAddModal(false);
  };

  const handleRemoveSong = async (songId: number) => {
    if (!setlist || !setlist.id) return;

    const newSongIds = setlist.songIds.filter(id => id !== songId);
    await updateSetlist(setlist.id, { songIds: newSongIds });
    loadSetlist(setlist.id);
  };

  const handleReorder = async (fromIndex: number, toIndex: number) => {
    if (!setlist || !setlist.id) return;

    const newSongIds = [...setlist.songIds];
    const [removed] = newSongIds.splice(fromIndex, 1);
    newSongIds.splice(toIndex, 0, removed);

    await updateSetlist(setlist.id, { songIds: newSongIds });
    loadSetlist(setlist.id);
  };

  const availableSongs = allSongs.filter(
    song => song.id && !setlist?.songIds.includes(song.id)
  );

  if (loading) {
    return (
      <div className="setlist-detail setlist-detail--loading">
        <div className="setlist-detail__spinner"></div>
        <p>Loading setlist...</p>
      </div>
    );
  }

  if (!setlist) return null;

  return (
    <div className="setlist-detail">
      <header className="setlist-detail__header">
        <Link to="/setlists" className="setlist-detail__back">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1>{setlist.name}</h1>
        <button onClick={() => setShowAddModal(true)} className="setlist-detail__add">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </header>

      <main className="setlist-detail__content">
        {songs.length === 0 ? (
          <div className="setlist-detail__empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <p>No songs in this setlist</p>
            <button onClick={() => setShowAddModal(true)} className="setlist-detail__add-btn">
              Add Songs
            </button>
          </div>
        ) : (
          <ol className="setlist-detail__songs">
            {songs.map((song, index) => (
              <li key={song.id} className="setlist-detail__song">
                <span className="setlist-detail__song-number">{index + 1}</span>
                <div className="setlist-detail__song-info">
                  <Link to={`/song/${song.id}`} className="setlist-detail__song-title">
                    {song.title}
                  </Link>
                  <span className="setlist-detail__song-artist">{song.artist}</span>
                </div>
                <div className="setlist-detail__song-actions">
                  {index > 0 && (
                    <button onClick={() => handleReorder(index, index - 1)} aria-label="Move up">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 15l-6-6-6 6" />
                      </svg>
                    </button>
                  )}
                  {index < songs.length - 1 && (
                    <button onClick={() => handleReorder(index, index + 1)} aria-label="Move down">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => song.id && handleRemoveSong(song.id)}
                    className="setlist-detail__song-remove"
                    aria-label="Remove"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </main>

      {showAddModal && (
        <div className="setlist-detail__modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="setlist-detail__modal" onClick={e => e.stopPropagation()}>
            <h2>Add Songs</h2>
            {availableSongs.length === 0 ? (
              <p className="setlist-detail__modal-empty">
                No more songs available. Add new songs first.
              </p>
            ) : (
              <ul className="setlist-detail__modal-songs">
                {availableSongs.map(song => (
                  <li key={song.id}>
                    <button onClick={() => song.id && handleAddSong(song.id)}>
                      <span className="setlist-detail__modal-song-title">{song.title}</span>
                      <span className="setlist-detail__modal-song-artist">{song.artist}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button onClick={() => setShowAddModal(false)} className="setlist-detail__modal-close">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
