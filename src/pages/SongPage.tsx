import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { SongView } from "../components/SongView";
import { TempoIndicator } from "../components/TempoIndicator";
import { addSong, deleteSong, getSong, type Song, updateSong } from "../db";
import { useSetlistOccurrence } from "../hooks/useSetlistOccurrence";
import { useUnsavedEdits } from "../hooks/useUnsavedEdits";
import {
	chordProToSimple,
	extractMetadata,
	injectMetadata,
	parseChordPro,
	type SongMetadata,
	simpleToChordPro,
	stripMetadata,
} from "../utils/chordEngine";
import { occurrenceContent, settingLabel } from "../utils/setlistSettings";
import "./SongPage.scss";

type EditorMode = "simple" | "advanced";

export const SongPage = () => {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const occurrenceIndex = Number(searchParams.get("occurrence") ?? 0);
	const occurrence = useSetlistOccurrence(searchParams.get("setlist"), id, occurrenceIndex);
	const isNew = id === "new";
	const startInEditMode = isNew || searchParams.get("edit") === "true";

	const [song, setSong] = useState<Partial<Song>>({
		title: "",
		artist: "",
		content: "",
		key: "",
		tempo: undefined,
		capo: undefined,
		time: "",
		tags: [],
	});
	const [isEditing, setIsEditing] = useState(startInEditMode);
	const [editorMode, setEditorMode] = useState<EditorMode>("simple");
	const [simpleContent, setSimpleContent] = useState("");
	const [tagInput, setTagInput] = useState("");
	const [loading, setLoading] = useState(!isNew);
	const [saving, setSaving] = useState(false);
	const [dirty, setDirty] = useState(false);
	const allowLeave = useUnsavedEdits(isEditing && dirty);
	const [displayKey, setDisplayKey] = useState<string | null>(null);

	// Resizable split pane state
	const [splitRatio, setSplitRatio] = useState(0.5);
	const [isResizing, setIsResizing] = useState(false);
	const splitContainerRef = useRef<HTMLDivElement>(null);

	// Convert ChordPro to simple format (with metadata stripped) when entering edit mode
	useEffect(() => {
		if (isEditing && song.content) {
			try {
				// First strip metadata, then convert to simple format
				const contentWithoutMeta = stripMetadata(song.content);
				const simple = chordProToSimple(contentWithoutMeta);
				setSimpleContent(simple);
			} catch {
				// If conversion fails, just strip metadata and use as-is
				setSimpleContent(stripMetadata(song.content));
			}
		}
	}, [isEditing, song.content]);

	const loadSong = useCallback(
		async (songId: string) => {
			try {
				const loadedSong = await getSong(songId);
				if (loadedSong) {
					setSong(loadedSong);
					setDirty(false);
				} else {
					navigate("/");
				}
			} catch (error) {
				console.error("Failed to load song:", error);
				navigate("/");
			} finally {
				setLoading(false);
			}
		},
		[navigate],
	);

	const openedSongId = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (openedSongId.current === id) return;
		openedSongId.current = id;
		setIsEditing(startInEditMode);
		setDirty(false);
		if (isNew) {
			setSong({ title: "", artist: "", content: "", key: "", tags: [] });
			setSimpleContent("");
			setTagInput("");
			setLoading(false);
		} else if (id) {
			setLoading(true);
			void loadSong(id);
		}
	}, [id, isNew, startInEditMode, loadSong]);

	// Parse the simple content to show a live preview
	const previewHtml = useMemo(() => {
		if (!simpleContent) return "";
		try {
			// Convert simple to ChordPro, then parse for HTML
			const chordPro = simpleToChordPro(simpleContent);
			const parsed = parseChordPro(chordPro);
			return parsed.html;
		} catch {
			return '<p style="color: #ef4444;">Preview unavailable</p>';
		}
	}, [simpleContent]);

	// Handle split pane resizing
	const handleResizeStart = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		setIsResizing(true);
	}, []);

	useEffect(() => {
		if (!isResizing) return;

		const handleMouseMove = (e: MouseEvent) => {
			if (!splitContainerRef.current) return;
			const container = splitContainerRef.current;
			const rect = container.getBoundingClientRect();
			const newRatio = (e.clientX - rect.left) / rect.width;
			setSplitRatio(Math.max(0.2, Math.min(0.8, newRatio)));
		};

		const handleMouseUp = () => {
			setIsResizing(false);
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isResizing]);

	const handleSave = async () => {
		// Build the final ChordPro content with metadata
		let lyricsContent = "";

		if (editorMode === "simple") {
			try {
				lyricsContent = simpleToChordPro(simpleContent);
			} catch {
				lyricsContent = simpleContent;
			}
		} else {
			// In advanced mode, strip existing metadata first (we'll re-inject from form)
			lyricsContent = stripMetadata(song.content || "");
		}

		// Extract existing metadata from original content to preserve extended fields
		// (composer, lyricist, copyright, album, year, duration, subtitle)
		const existingMetadata = extractMetadata(song.content || "");

		// Build metadata from form fields, merged with existing extended metadata
		const metadata: SongMetadata = {
			// Primary fields from form
			title: song.title || undefined,
			artist: song.artist || undefined,
			key: song.key || undefined,
			tempo: song.tempo || undefined,
			capo: song.capo || undefined,
			time: song.time || undefined,
			// Preserve extended metadata from original content
			subtitle: existingMetadata.subtitle,
			composer: existingMetadata.composer,
			lyricist: existingMetadata.lyricist,
			copyright: existingMetadata.copyright,
			album: existingMetadata.album,
			year: existingMetadata.year,
			duration: existingMetadata.duration,
		};

		// Inject metadata into the content
		const contentToSave = injectMetadata(lyricsContent, metadata);

		if (!song.title || !lyricsContent.trim()) {
			alert("Please enter a title and content");
			return;
		}

		setSaving(true);
		try {
			const songData = {
				title: song.title,
				artist: song.artist || "Unknown",
				content: contentToSave,
				key: song.key,
				tempo: song.tempo,
				capo: song.capo,
				time: song.time,
				// Preserve extended metadata in database too
				subtitle: existingMetadata.subtitle,
				composer: existingMetadata.composer,
				lyricist: existingMetadata.lyricist,
				copyright: existingMetadata.copyright,
				album: existingMetadata.album,
				year: existingMetadata.year,
				duration: existingMetadata.duration,
				tags: song.tags || [],
			};

			if (isNew) {
				const newId = await addSong(songData);
				allowLeave();
				setDirty(false);
				navigate(`/song/${newId}`, { replace: true });
			} else if (id) {
				await updateSong(id, songData);
				setSong((prev) => ({ ...prev, content: contentToSave }));
			}
			setIsEditing(false);
			setDirty(false);
		} catch (error) {
			console.error("Failed to save song:", error);
			alert("Failed to save song");
		} finally {
			setSaving(false);
		}
	};

	const handleAddTag = () => {
		setDirty(true);
		if (tagInput.trim() && !song.tags?.includes(tagInput.trim())) {
			setSong((prev) => ({
				...prev,
				tags: [...(prev.tags || []), tagInput.trim()],
			}));
			setTagInput("");
		}
	};

	const handleRemoveTag = (tag: string) => {
		setDirty(true);
		setSong((prev) => ({
			...prev,
			tags: (prev.tags || []).filter((t) => t !== tag),
		}));
	};

	const switchEditorMode = (mode: EditorMode) => {
		if (mode === "advanced" && editorMode === "simple") {
			// Convert simple to ChordPro before switching
			try {
				const chordPro = simpleToChordPro(simpleContent);
				// Preserve extended metadata while updating the editable fields.
				const metadata: SongMetadata = {
					...extractMetadata(song.content || ""),
					title: song.title || undefined,
					artist: song.artist || undefined,
					key: song.key || undefined,
					tempo: song.tempo || undefined,
					capo: song.capo || undefined,
					time: song.time || undefined,
				};
				setSong((prev) => ({ ...prev, content: injectMetadata(chordPro, metadata) }));
			} catch {
				// Keep existing content
			}
		} else if (mode === "simple" && editorMode === "advanced") {
			// Convert ChordPro to simple before switching (strip metadata)
			try {
				const contentWithoutMeta = stripMetadata(song.content || "");
				const simple = chordProToSimple(contentWithoutMeta);
				setSimpleContent(simple);
			} catch {
				setSimpleContent(stripMetadata(song.content || ""));
			}
		}
		setEditorMode(mode);
	};

	if (loading) {
		return (
			<div className="song-page song-page--loading">
				<div className="song-page__spinner" />
				<p>Loading song...</p>
			</div>
		);
	}

	return (
		<div className="song-page">
			<header className="song-page__header">
				<Link to="/" className="song-page__back" aria-label="Go back">
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						aria-hidden="true"
					>
						<path d="M19 12H5M12 19l-7-7 7-7" />
					</svg>
				</Link>

				{!isEditing && (
					<div className="song-page__title-row">
						<h1 className="song-page__title">{song.title || "Untitled"}</h1>
						{occurrence.list && (
							<span className="song-page__meta-tag">
								{occurrence.list.name} · {settingLabel(song as Song, occurrence.setting)}
							</span>
						)}
						{song.artist && <span className="song-page__artist">by {song.artist}</span>}
						{(displayKey || song.key) && (
							<span className="song-page__meta-tag">Key: {displayKey || song.key}</span>
						)}
						<TempoIndicator bpm={song.tempo} time={song.time} />
						{!!(occurrence.setting?.capo ?? song.capo) && (
							<span className="song-page__meta-tag">
								Capo {occurrence.setting?.capo ?? song.capo}
							</span>
						)}
						{song.time && <span className="song-page__meta-tag">{song.time}</span>}
						{song.tags && song.tags.length > 0 && (
							<div className="song-page__tags-inline">
								{song.tags.map((tag) => (
									<span key={tag} className="song-page__tag-inline">
										{tag}
									</span>
								))}
							</div>
						)}
					</div>
				)}

				{isEditing && (
					<div className="song-page__title-row">
						<h1 className="song-page__title">{isNew ? "New Song" : "Edit Song"}</h1>
					</div>
				)}

				{occurrence.error && <p role="alert">{occurrence.error}</p>}
				<div className="song-page__actions">
					{!isEditing && (
						<>
							<Link
								to={
									occurrence.list
										? `/perform/setlist/${occurrence.list.id}?occurrence=${occurrenceIndex}`
										: `/perform/song/${id}`
								}
								className="song-page__btn song-page__btn--secondary"
							>
								Perform
							</Link>
							<button
								type="button"
								className="song-page__btn song-page__btn--secondary"
								onClick={() => {
									if (
										!id ||
										!confirm(`Delete “${song.title}”? It will also be removed from setlists.`)
									)
										return;
									void deleteSong(id)
										.then(() => navigate("/"))
										.catch(() => alert("Could not delete the song. Please try again."));
								}}
							>
								Delete
							</button>
						</>
					)}
					{isEditing ? (
						<>
							<button
								type="button"
								onClick={async () => {
									if (dirty && !confirm("Discard unsaved changes?")) return;
									allowLeave();
									setDirty(false);
									if (isNew) navigate("/");
									else if (id) {
										await loadSong(id);
										setIsEditing(false);
									}
								}}
								className="song-page__btn song-page__btn--secondary"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleSave}
								disabled={saving}
								className="song-page__btn song-page__btn--primary"
							>
								{saving ? "Saving..." : "Save"}
							</button>
						</>
					) : (
						<button
							type="button"
							onClick={() => setIsEditing(true)}
							className="song-page__btn song-page__btn--primary"
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								aria-hidden="true"
							>
								<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
								<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
							</svg>
							Edit
						</button>
					)}
				</div>
			</header>

			{isEditing ? (
				<div className="song-page__editor" onInput={() => setDirty(true)}>
					{/* Row 1: Title, Artist, Key */}
					<div className="song-page__meta-row">
						<div className="song-page__field song-page__field--flex2">
							<label htmlFor="song-title">Title</label>
							<input
								id="song-title"
								type="text"
								value={song.title || ""}
								onChange={(e) => setSong((prev) => ({ ...prev, title: e.target.value }))}
								placeholder="Song title"
							/>
						</div>
						<div className="song-page__field song-page__field--flex2">
							<label htmlFor="song-artist">Artist</label>
							<input
								id="song-artist"
								type="text"
								value={song.artist || ""}
								onChange={(e) => setSong((prev) => ({ ...prev, artist: e.target.value }))}
								placeholder="Artist name"
							/>
						</div>
						<div className="song-page__field song-page__field--flex1">
							<label htmlFor="song-key">Key</label>
							<input
								id="song-key"
								type="text"
								value={song.key || ""}
								onChange={(e) => setSong((prev) => ({ ...prev, key: e.target.value }))}
								placeholder="G"
							/>
						</div>
					</div>

					{/* Row 2: Tempo, Capo, Time, Tags */}
					<div className="song-page__meta-row">
						<div className="song-page__field song-page__field--flex1">
							<label htmlFor="song-tempo">Tempo (BPM)</label>
							<input
								id="song-tempo"
								type="number"
								value={song.tempo || ""}
								onChange={(e) =>
									setSong((prev) => ({
										...prev,
										tempo: e.target.value ? parseInt(e.target.value, 10) : undefined,
									}))
								}
								placeholder="120"
								min="20"
								max="300"
							/>
						</div>
						<div className="song-page__field song-page__field--flex1">
							<label htmlFor="song-capo">Capo</label>
							<input
								id="song-capo"
								type="number"
								value={song.capo || ""}
								onChange={(e) =>
									setSong((prev) => ({
										...prev,
										capo: e.target.value ? parseInt(e.target.value, 10) : undefined,
									}))
								}
								placeholder="0"
								min="0"
								max="12"
							/>
						</div>
						<div className="song-page__field song-page__field--flex1">
							<label htmlFor="song-time">Time</label>
							<input
								id="song-time"
								type="text"
								value={song.time || ""}
								onChange={(e) => setSong((prev) => ({ ...prev, time: e.target.value }))}
								placeholder="4/4"
							/>
						</div>
						<div className="song-page__field song-page__field--flex3">
							<div className="label">Tags</div>
							<div className="song-page__tags-row">
								<div className="song-page__tags-input">
									<input
										type="text"
										value={tagInput}
										onChange={(e) => setTagInput(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												handleAddTag();
											}
										}}
										placeholder="Add tag..."
									/>
									<button type="button" onClick={handleAddTag}>
										+
									</button>
								</div>
								{song.tags && song.tags.length > 0 && (
									<div className="song-page__tags">
										{song.tags.map((tag) => (
											<span key={tag} className="song-page__tag">
												{tag}
												<button type="button" onClick={() => handleRemoveTag(tag)}>
													×
												</button>
											</span>
										))}
									</div>
								)}
							</div>
						</div>
					</div>

					{/* Editor mode toggle */}
					<div className="song-page__mode-toggle">
						<button
							type="button"
							className={`song-page__mode-btn ${editorMode === "simple" ? "song-page__mode-btn--active" : ""}`}
							onClick={() => switchEditorMode("simple")}
						>
							Simple
						</button>
						<button
							type="button"
							className={`song-page__mode-btn ${editorMode === "advanced" ? "song-page__mode-btn--active" : ""}`}
							onClick={() => switchEditorMode("advanced")}
						>
							Advanced (ChordPro)
						</button>
					</div>

					{/* Content editor */}
					<div className="song-page__content-area">
						{editorMode === "simple" ? (
							<div
								className={`song-page__simple-editor ${isResizing ? "song-page__simple-editor--resizing" : ""}`}
								ref={splitContainerRef}
							>
								<div
									className="song-page__simple-input"
									style={{ flex: `0 0 calc(${splitRatio * 100}% - 3px)` }}
								>
									<label htmlFor="simple-content">
										Lyrics with chords
										<span className="song-page__hint">Type chords on lines above lyrics</span>
									</label>
									<textarea
										id="simple-content"
										value={simpleContent}
										onChange={(e) => setSimpleContent(e.target.value)}
										placeholder={`   Am       C/G       F    C
Let it be, let it be, let it be, let it be
    C     G        F   C/E Dm C
Whisper words of wisdom, let it be`}
									/>
								</div>
								{/* biome-ignore lint/a11y/useSemanticElements: custom resize handle */}
								<div
									className={`song-page__resize-handle ${isResizing ? "song-page__resize-handle--active" : ""}`}
									onMouseDown={handleResizeStart}
									role="separator"
									aria-orientation="vertical"
									aria-valuenow={splitRatio * 100}
									aria-valuemin={20}
									aria-valuemax={80}
									tabIndex={0}
								/>
								<div
									className="song-page__simple-preview"
									style={{ flex: `0 0 calc(${(1 - splitRatio) * 100}% - 3px)` }}
								>
									<div className="label">Preview</div>
									<div
										className="song-page__preview-content"
										// biome-ignore lint/security/noDangerouslySetInnerHtml: Sanitized HTML from chord engine
										dangerouslySetInnerHTML={{ __html: previewHtml }}
									/>
								</div>
							</div>
						) : (
							<div className="song-page__advanced-editor">
								<label htmlFor="advanced-content">
									ChordPro format
									<a
										href="https://www.chordpro.org/chordpro/chordpro-introduction/"
										target="_blank"
										rel="noopener noreferrer"
									>
										Learn ChordPro
									</a>
								</label>
								<textarea
									id="advanced-content"
									value={song.content || ""}
									onChange={(e) => setSong((prev) => ({ ...prev, content: e.target.value }))}
									placeholder={`{start_of_verse: Verse 1}
[G]Amazing [G7]grace, how [C]sweet the [G]sound
That [G]saved a [Em]wretch like [D]me
{end_of_verse}

{start_of_chorus: Chorus}
[C]This is the [G]chorus
{end_of_chorus}`}
								/>
							</div>
						)}
					</div>
				</div>
			) : (
				<SongView
					readingKey={
						occurrence.list
							? `setlist:${occurrence.list.id}:${occurrenceIndex}:${id}`
							: `song:${id}`
					}
					key={`${id}:${searchParams.get("setlist")}:${occurrenceIndex}`}
					content={
						occurrence.list
							? occurrenceContent(song as Song, occurrence.setting)
							: song.content || ""
					}
					transposeValue={occurrence.list ? (occurrence.setting?.transpose ?? 0) : undefined}
					onTransposeChange={
						occurrence.list ? (value) => void occurrence.transpose(value) : undefined
					}
					title={song.title}
					artist={song.artist}
					onKeyChange={setDisplayKey}
				/>
			)}
		</div>
	);
};
