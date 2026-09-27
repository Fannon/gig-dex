import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { SongView } from "../components/SongView";
import { TempoIndicator } from "../components/TempoIndicator";
import { getAllSongs, getSetlist, type Song } from "../db";
import { extractMetadata } from "../utils/chordEngine";
import "./PerformancePage.scss";

type Mode = "auto" | "scroll" | "pages";
export const PerformancePage = () => {
	const { id, listId } = useParams();
	const root = useRef<HTMLDivElement>(null);
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
			setOrder(ids);
			setName(list?.name ?? "Song performance");
			let saved = 0;
			try {
				const stored = JSON.parse(localStorage.getItem(sessionKey) ?? "null");
				if (stored?.order === JSON.stringify(ids)) saved = stored.index;
			} catch {
				/* Ignore stale preferences. */
			}
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
	const move = (delta: number) => {
		const next = Math.max(0, Math.min(songs.length - 1, index + delta));
		setIndex(next);
		try {
			localStorage.setItem(
				sessionKey,
				JSON.stringify({ order: JSON.stringify(order), index: next }),
			);
		} catch {
			/* Optional preference. */
		}
	};
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
	const metadata = song ? extractMetadata(song.content) : undefined;
	return (
		<div className="performance-page" ref={root}>
			<header>
				<Link to={listId ? `/setlist/${listId}` : `/song/${id}`}>← Exit</Link>
				<div>
					<span>
						{name} · {songs.length ? index + 1 : 0}/{songs.length}
					</span>
					<h1>{song?.title ?? (loading ? "Loading…" : "Song unavailable")}</h1>
				</div>
				{song && <TempoIndicator key={`${index}:${song.id}`} bpm={song.tempo ?? metadata?.tempo} />}
				<button type="button" onClick={() => void toggleFullscreen()}>
					{fullscreen ? "Exit fullscreen" : "Fullscreen"}
				</button>
			</header>
			<div className="performance-page__options">
				<label>
					Reading{" "}
					<select
						aria-label="Reading mode"
						value={mode}
						onChange={(event) => {
							const value = event.target.value as Mode;
							setMode(value);
							localStorage.setItem("performance_mode", value);
						}}
					>
						<option value="auto">Fit screen</option>
						<option value="scroll">Scroll</option>
						<option value="pages">Pages</option>
					</select>
				</label>
				<button
					type="button"
					aria-pressed={controls}
					onClick={() => setControls((value) => !value)}
				>
					Song controls
				</button>
			</div>
			{error && <p role="alert">{error}</p>}
			{song ? (
				<SongView
					key={`${sessionKey}:${index}:${song.id}:${mode}`}
					content={song.content}
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
							? "This song is missing from your library. Use Next song to continue."
							: "This setlist has no songs yet."}
				</p>
			)}
			<nav className="performance-page__navigation" aria-label="Setlist performance">
				<button type="button" onClick={() => move(-1)} disabled={index <= 0}>
					← Previous song
				</button>
				<button
					type="button"
					onClick={() => move(1)}
					disabled={index >= songs.length - 1 || !songs.length}
				>
					Next song →
				</button>
			</nav>
		</div>
	);
};
