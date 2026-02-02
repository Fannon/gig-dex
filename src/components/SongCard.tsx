import { Link } from 'react-router-dom';
import type { Song } from '../db';
import './SongCard.scss';

interface SongCardProps {
  song: Song;
  onDelete?: (id: number) => void;
}

export const SongCard = ({ song, onDelete }: SongCardProps) => {
  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (song.id && onDelete) {
      onDelete(song.id);
    }
  };

  return (
    <Link to={`/song/${song.id}`} className="song-card">
      <div className="song-card__content">
        <span className="song-card__title">{song.title}</span>
        {song.artist && <span className="song-card__artist">by {song.artist}</span>}
        {song.key && <span className="song-card__key">{song.key}</span>}
        {song.tags.length > 0 && (
          <div className="song-card__tags">
            {song.tags.slice(0, 3).map(tag => (
              <span key={tag} className="song-card__tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
      <div className="song-card__actions">
        <Link
          to={`/song/${song.id}?edit=true`}
          className="song-card__action song-card__action--edit"
          onClick={e => e.stopPropagation()}
          aria-label="Edit song"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </Link>
        <button
          className="song-card__action song-card__action--delete"
          onClick={handleDelete}
          aria-label="Delete song"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
        </button>
      </div>
    </Link>
  );
};
