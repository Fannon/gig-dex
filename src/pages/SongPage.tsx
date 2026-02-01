import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getSong, updateSong, addSong, type Song } from '../db';
import { SongView } from '../components/SongView';
import './SongPage.scss';

export const SongPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [song, setSong] = useState<Partial<Song>>({
    title: '',
    artist: '',
    content: '',
    key: '',
    tags: [],
  });
  const [isEditing, setIsEditing] = useState(isNew);
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isNew && id) {
      loadSong(parseInt(id, 10));
    }
  }, [id, isNew]);

  const loadSong = async (songId: number) => {
    try {
      const loadedSong = await getSong(songId);
      if (loadedSong) {
        setSong(loadedSong);
      } else {
        navigate('/');
      }
    } catch (error) {
      console.error('Failed to load song:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!song.title || !song.content) {
      alert('Please enter a title and content');
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const newId = await addSong({
          title: song.title,
          artist: song.artist || 'Unknown',
          content: song.content,
          key: song.key,
          tags: song.tags || [],
        });
        navigate(`/song/${newId}`, { replace: true });
      } else if (id) {
        await updateSong(parseInt(id, 10), song);
      }
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save song:', error);
      alert('Failed to save song');
    } finally {
      setSaving(false);
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !song.tags?.includes(tagInput.trim())) {
      setSong(prev => ({
        ...prev,
        tags: [...(prev.tags || []), tagInput.trim()],
      }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setSong(prev => ({
      ...prev,
      tags: (prev.tags || []).filter(t => t !== tag),
    }));
  };

  if (loading) {
    return (
      <div className="song-page song-page--loading">
        <div className="song-page__spinner"></div>
        <p>Loading song...</p>
      </div>
    );
  }

  return (
    <div className="song-page">
      <header className="song-page__header">
        <Link to="/" className="song-page__back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        
        {!isEditing && (
          <div className="song-page__title-row">
            <h1 className="song-page__title">{song.title || 'Untitled'}</h1>
            {song.artist && <span className="song-page__artist">by {song.artist}</span>}
            {song.key && <span className="song-page__meta-tag">Key: {song.key}</span>}
            {song.tags && song.tags.length > 0 && (
              <div className="song-page__tags-inline">
                {song.tags.map(tag => (
                  <span key={tag} className="song-page__tag-inline">{tag}</span>
                ))}
              </div>
            )}
          </div>
        )}
        
        {isEditing && (
          <div className="song-page__title-row">
            <h1 className="song-page__title">{isNew ? 'New Song' : 'Edit Song'}</h1>
          </div>
        )}

        <div className="song-page__actions">
          {isEditing ? (
            <>
              <button
                onClick={() => isNew ? navigate('/') : setIsEditing(false)}
                className="song-page__btn song-page__btn--secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="song-page__btn song-page__btn--primary"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="song-page__btn song-page__btn--primary"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
          )}
        </div>
      </header>

      {isEditing ? (
        <div className="song-page__editor">
          <div className="song-page__field">
            <label>Title</label>
            <input
              type="text"
              value={song.title || ''}
              onChange={e => setSong(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Song title"
            />
          </div>

          <div className="song-page__field">
            <label>Artist</label>
            <input
              type="text"
              value={song.artist || ''}
              onChange={e => setSong(prev => ({ ...prev, artist: e.target.value }))}
              placeholder="Artist name"
            />
          </div>

          <div className="song-page__row">
            <div className="song-page__field">
              <label>Key</label>
              <input
                type="text"
                value={song.key || ''}
                onChange={e => setSong(prev => ({ ...prev, key: e.target.value }))}
                placeholder="G, Am, etc."
              />
            </div>

            <div className="song-page__field song-page__field--tags">
              <label>Tags</label>
              <div className="song-page__tags-input">
                <input
                  type="text"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  placeholder="Add tag"
                />
                <button onClick={handleAddTag} type="button">+</button>
              </div>
              {song.tags && song.tags.length > 0 && (
                <div className="song-page__tags">
                  {song.tags.map(tag => (
                    <span key={tag} className="song-page__tag">
                      {tag}
                      <button onClick={() => handleRemoveTag(tag)}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="song-page__field song-page__field--content">
            <label>
              Content (ChordPro format)
              <a href="https://www.chordpro.org/chordpro/chordpro-introduction/" target="_blank" rel="noopener">
                Learn ChordPro
              </a>
            </label>
            <textarea
              value={song.content || ''}
              onChange={e => setSong(prev => ({ ...prev, content: e.target.value }))}
              placeholder={`{title: Song Title}
{artist: Artist Name}
{key: G}

{start_of_verse: Verse 1}
[G]Amazing [G7]grace, how [C]sweet the [G]sound
That [G]saved a [Em]wretch like [D]me
{end_of_verse}`}
            />
          </div>
        </div>
      ) : (
        <SongView
          content={song.content || ''}
          title={song.title}
          artist={song.artist}
        />
      )}
    </div>
  );
};
