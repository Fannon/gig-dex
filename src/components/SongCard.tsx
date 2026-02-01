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
        <h3 className="song-card__title">{song.title}</h3>
        <p className="song-card__artist">{song.artist}</p>
        {song.key && <span className="song-card__key">Key: {song.key}</span>}
        {song.tags.length > 0 && (
          <div className="song-card__tags">
            {song.tags.slice(0, 3).map(tag => (
              <span key={tag} className="song-card__tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
      <div className="song-card__actions">
        <button
          className="song-card__delete"
          onClick={handleDelete}
          aria-label="Delete song"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
        </button>
      </div>
    </Link>
  );
};
