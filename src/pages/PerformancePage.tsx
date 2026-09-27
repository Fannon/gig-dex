import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { ActionIcon } from "../components/ActionIcon";
import type { LibraryWorkspaceContext } from "../components/LibraryWorkspace";
import { SongView } from "../components/SongView";
import { TempoIndicator } from "../components/TempoIndicator";
import { getAllSongs, getSetlist, type Setlist, type Song, updateSetlist, updateSong } from "../db";
import { useWakeLock } from "../hooks/useWakeLock";
import { blockPwaUpdate } from "../pwa/lifecycle";
import { extractMetadata } from "../utils/chordEngine";
import { occurrenceContent, occurrenceSettings, settingLabel } from "../utils/setlistSettings";
import { tempoMeter, withSongTime } from "../utils/tempo";
import "./PerformancePage.scss";

type Mode = "auto" | "scroll" | "pages";
export const PerformancePage = () => {
	const { id, listId } = useParams();
	const { performanceHost, setPerformanceExit } = useOutletContext<LibraryWorkspaceContext>();
	const [wide, setWide] = useState(() => window.matchMedia("(min-width: 1200px)").matches);
	const [tempoRunning, setTempoRunning] = useState(true);
	useEffect(() => {
		const media = window.matchMedia("(min-width: 1200px)");
		const change = () => setWide(media.matches);
		media.addEventListener("change", change);
		return () => media.removeEventListener("change", change);
	}, []);
	const [params, setParams] = useSearchParams();
	const requestedIndex = params.has("occurrence") ? Number(params.get("occurrence")) : undefined;
	const requested = useRef(requestedIndex);
	requested.current = requestedIndex;
	const awake = useWakeLock();
	useEffect(() => blockPwaUpdate(), []);
	const root = useRef<HTMLDivElement>(null);
	const [setlist, setSetlist] = useState<Setlist>();
	const [songs, setSongs] = useState<(Song | undefined)[]>([]);
	const [order, setOrder] = useState<string[]>([]);
	const [name, setName] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(true);
	const [index, setIndex] = useState(0);
	const [mode, setMode] = useState<Mode>(() => {
		const saved = localStorage.getItem("performance_mode");
		return saved === "scroll" || saved === "pages" ? saved : "auto";
	});
	const [optionsOpen, setOptionsOpen] = useState(false);
	const optionsDialog = useRef<HTMLDialogElement>(null);
	const swipe = useRef<{ x: number; y: number } | undefined>(undefined);
	const [savingMeter, setSavingMeter] = useState(false);
	const [controls, setControls] = useState(false);
	const [fullscreen, setFullscreen] = useState(false);
	const sessionKey = `performance:${listId ?? id}`;
	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			const library = await getAllSongs();
			const list = listId ? await getSetlist(listId) : undefined;
			if (listId && !list) throw new Error("Setlist not found.");
			const ids = list?.songIds ?? (id ? [id] : []);
			const ordered = ids.map((songId) => library.find((song) => song.id === songId));
			if (cancelled) return;
			setSongs(ordered);
			setTempoRunning(true);
			setSetlist(list);
			setOrder(ids);
			setName(list?.name ?? "Song performance");
			let saved = 0;
			try {
				const stored = JSON.parse(localStorage.getItem(sessionKey) ?? "null");
				if (stored?.order === JSON.stringify(ids)) saved = stored.index;
			} catch {
				/* Ignore stale preferences. */
			}
			if (requested.current !== undefined && Number.isInteger(requested.current))
				saved = requested.current;
			setIndex(Number.isInteger(saved) ? Math.max(0, Math.min(ids.length - 1, saved)) : 0);
			setLoading(false);
		};
		void load().catch((error) => {
			if (!cancelled) {
				setError(error.message);
				setLoading(false);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [id, listId, sessionKey]);
	useEffect(() => {
		const change = () => setFullscreen(document.fullscreenElement === root.current);
		document.addEventListener("fullscreenchange", change);
		return () => document.removeEventListener("fullscreenchange", change);
	}, []);
	const move = useCallback(
		(delta: number) => {
			const next = Math.max(0, Math.min(songs.length - 1, index + delta));
			setIndex(next);
			if (next !== index) setTempoRunning(true);
			if (params.has("occurrence")) setParams({ occurrence: String(next) }, { replace: true });
			try {
				localStorage.setItem(
					sessionKey,
					JSON.stringify({ order: JSON.stringify(order), index: next }),
				);
			} catch {
				/* Optional preference. */
			}
		},
		[songs.length, index, params, setParams, sessionKey, order],
	);
	useEffect(() => {
		const keydown = (event: KeyboardEvent) => {
			if (
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				optionsOpen ||
				document.querySelector("dialog[open]") ||
				(event.target instanceof HTMLElement &&
					event.target.closest("input, textarea, select, [contenteditable=true]"))
			)
				return;
			const delta = ["ArrowRight", "ArrowDown"].includes(event.key)
				? 1
				: ["ArrowLeft", "ArrowUp"].includes(event.key)
					? -1
					: 0;
			if (delta) {
				event.preventDefault();
				move(delta);
			}
		};
		window.addEventListener("keydown", keydown);
		return () => window.removeEventListener("keydown", keydown);
	}, [move, optionsOpen]);
	useEffect(() => {
		if (optionsOpen) optionsDialog.current?.showModal();
		else optionsDialog.current?.close();
	}, [optionsOpen]);
	const toggleFullscreen = async () => {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else if (root.current?.requestFullscreen) await root.current.requestFullscreen();
			else setError("Fullscreen is unavailable in this browser. Performance mode still works.");
		} catch {
			setError("Fullscreen could not start. Performance mode still works.");
		}
	};
	const song = songs[index];
	const [readingTranspose, setReadingTranspose] = useState(0);
	// biome-ignore lint/correctness/useExhaustiveDependencies: Song identity resets the temporary reading transpose.
	useEffect(() => {
		setReadingTranspose(song?.defaultTranspose ?? 0);
	}, [song?.id, song?.defaultTranspose]);
	useEffect(() => {
		const url =
			listId && song
				? `/song/${song.id}?setlist=${listId}&occurrence=${index}`
				: listId
					? `/setlist/${listId}`
					: `/song/${id}`;
		setPerformanceExit(url);
		return () => setPerformanceExit(null);
	}, [song, listId, id, index, setPerformanceExit]);
	const metadata = song ? extractMetadata(song.content) : undefined;
	const meter = tempoMeter(song?.time ?? metadata?.time).label;
	const saveMeter = async (time: string) => {
		if (!song || savingMeter) return;
		setSavingMeter(true);
		try {
			const content = withSongTime(song.content, time);
			await updateSong(song.id, { time, content });
			setSongs((previous) =>
				previous.map((entry) => (entry?.id === song.id ? { ...entry, time, content } : entry)),
			);
		} catch {
			setError("Could not save beat division. Please try again.");
		} finally {
			setSavingMeter(false);
		}
	};
	const docked = wide && !fullscreen && performanceHost !== null;
	const bar = (
		<div className="performance-page__bar" role="toolbar" aria-label="Performance controls">
			<Link to={listId ? `/setlist/${listId}` : `/song/${id}`}>← Exit</Link>
			<div className="performance-page__title">
				<div className="performance-page__caption">
					<span title={name}>{name}</span>
					<small>
						{" "}
						· {songs.length ? index + 1 : 0}/{songs.length}
						{song
							? ` · ${settingLabel(song, setlist ? setlist.songSettings?.[index] : { transpose: readingTranspose })}`
							: ""}
					</small>
				</div>
				<h1 title={song?.title}>{song?.title ?? (loading ? "Loading…" : "Song unavailable")}</h1>
			</div>
			{song && (
				<TempoIndicator
					compact
					key={`${index}:${song.id}`}
					bpm={song.tempo ?? metadata?.tempo}
					time={meter}
					runningValue={tempoRunning}
					onRunningChange={setTempoRunning}
				/>
			)}
			{song && (
				<Link
					className="performance-page__edit"
					aria-label="Edit song"
					title="Quick edit song"
					to={`/song/${song.id}?edit=true&from=performance${listId ? `&setlist=${listId}&occurrence=${index}` : ""}`}
				>
					<ActionIcon name="edit" />
				</Link>
			)}
			<button
				className="performance-page__fullscreen"
				type="button"
				onClick={() => void toggleFullscreen()}
			>
				{fullscreen ? "Exit fullscreen" : "Fullscreen"}
			</button>
			<button
				type="button"
				aria-label="Performance options"
				title="Performance options"
				onClick={() => setOptionsOpen(true)}
			>
				⚙
			</button>
		</div>
	);
	return (
		<div
			className="performance-page"
			ref={root}
			aria-describedby="performance-navigation-help"
			onTouchStart={(event) => {
				swipe.current = undefined;
				if (
					event.touches.length !== 1 ||
					(event.target instanceof HTMLElement &&
						event.target.closest("button, input, select, textarea, dialog, .song-view__controls"))
				)
					return;
				swipe.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
			}}
			onTouchCancel={() => {
				swipe.current = undefined;
			}}
			onTouchEnd={(event) => {
				const start = swipe.current;
				swipe.current = undefined;
				if (!start || !event.changedTouches[0] || optionsOpen) return;
				const dx = event.changedTouches[0].clientX - start.x;
				const dy = event.changedTouches[0].clientY - start.y;
				if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 2) move(dx < 0 ? 1 : -1);
			}}
		>
			<span className="sr-only" id="performance-navigation-help">
				Use Left or Up for the previous song, Right or Down for the next song, or swipe left/right.
			</span>
			{docked ? createPortal(bar, performanceHost) : bar}
			<dialog
				ref={optionsDialog}
				className="performance-page__options"
				aria-label="Performance options"
				onCancel={(event) => {
					event.preventDefault();
					setOptionsOpen(false);
				}}
			>
				<div className="performance-page__options-heading">
					<strong>Performance options</strong>
					<button
						type="button"
						aria-label="Close performance options"
						onClick={() => setOptionsOpen(false)}
					>
						×
					</button>
				</div>
				<button
					className="performance-page__mobile-fullscreen"
					type="button"
					onClick={() => {
						setOptionsOpen(false);
						void toggleFullscreen();
					}}
				>
					{fullscreen ? "Exit fullscreen" : "Fullscreen"}
				</button>
				<button type="button" aria-pressed={awake.enabled} onClick={awake.toggle}>
					Keep screen awake
				</button>
				{awake.enabled && (
					<span className="performance-page__wake-status">Screen: {awake.status}</span>
				)}
				{awake.enabled && awake.status.includes("Retry") && (
					<button type="button" onClick={awake.retry}>
						Retry wake lock
					</button>
				)}
				<label>
					Reading{" "}
					<select
						aria-label="Reading mode"
						value={mode}
						onChange={(event) => {
							const value = event.target.value as Mode;
							setMode(value);
							localStorage.setItem("performance_mode", value);
							setOptionsOpen(false);
						}}
					>
						<option value="auto">Fit screen</option>
						<option value="scroll">Scroll</option>
						<option value="pages">Pages</option>
					</select>
				</label>
				<label>
					Beat division
					<select
						aria-label="Beat division"
						value={meter}
						disabled={!song || savingMeter}
						onChange={(event) => void saveMeter(event.target.value)}
					>
						{[...new Set([meter, "4/4", "3/4", "2/4", "2/3", "6/8", "8/8", "5/4", "7/8"])].map(
							(value) => (
								<option key={value}>{value}</option>
							),
						)}
					</select>
				</label>
				<small>
					Saved for this song. Defaults to 4/4. Quarter-note BPM; eighth-note divisions pulse twice
					per quarter note.
				</small>
				<button
					type="button"
					aria-pressed={controls}
					onClick={() => {
						setControls((value) => !value);
						setOptionsOpen(false);
					}}
				>
					Song controls
				</button>
			</dialog>
			{error && <p role="alert">{error}</p>}
			{song ? (
				<SongView
					key={`${sessionKey}:${index}:${song.id}:${mode}`}
					content={occurrenceContent(song, setlist?.songSettings?.[index])}
					transposeValue={
						setlist ? (setlist.songSettings?.[index]?.transpose ?? 0) : readingTranspose
					}
					onTransposeChange={
						setlist
							? (transpose) => {
									const settings = occurrenceSettings(setlist);
									settings[index] = { ...settings[index], transpose };
									void updateSetlist(setlist.id, { songSettings: settings })
										.then(() => setSetlist({ ...setlist, songSettings: settings }))
										.catch(() => setError("Could not save transpose. Please try again."));
								}
							: setReadingTranspose
					}
					fitToScreen={mode === "auto"}
					readingKey={`${sessionKey}:${index}:${song.id}`}
					paginated={mode === "pages"}
					hideControls={!controls}
				/>
			) : (
				<p className="performance-page__empty">
					{loading
						? "Loading your songs…"
						: songs.length
							? "This song is missing from your library. Use arrow keys or swipe to continue."
							: "This setlist has no songs yet."}
				</p>
			)}
		</div>
	);
};
