import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
	getAllSetlists,
	getAllSongs,
	getSetlist,
	type Setlist,
	type Song,
	updateSetlist,
} from "../db";
import { occurrenceSettings, settingLabel } from "../utils/setlistSettings";
import "./LibraryWorkspace.scss";

const readPreference = (key: string, fallback = "") => {
	try {
		return localStorage.getItem(key) ?? fallback;
	} catch {
		return fallback;
	}
};
const remember = (key: string, value: string) => {
	try {
		localStorage.setItem(key, value);
	} catch {
		/* Optional preferences. */
	}
};
const matches = (text: string, query: string) =>
	query
		.trim()
		.toLocaleLowerCase()
		.split(/\s+/)
		.every((term) => text.toLocaleLowerCase().includes(term));

export function LibraryWorkspace() {
	const location = useLocation();
	const navigate = useNavigate();
	const [songs, setSongs] = useState<Song[]>([]);
	const [lists, setLists] = useState<Setlist[]>([]);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [open, setOpen] = useState(
		() =>
			readPreference(
				"sidebar-open",
				window.matchMedia("(max-width: 800px)").matches ? "false" : "true",
			) === "true",
	);
	const [songsExpanded, setSongsExpanded] = useState(
		() => readPreference("sidebar-songs", "true") === "true",
	);
	const [listsExpanded, setListsExpanded] = useState(
		() => readPreference("sidebar-setlist", "true") === "true",
	);
	const [chosen, setChosen] = useState(() => readPreference("sidebar-current-setlist"));
	const [songQuery, setSongQuery] = useState("");
	const [query, setQuery] = useState("");
	const [searchOpen, setSearchOpen] = useState(false);
	const dragged = useRef<{ songId?: string; index?: number; listId?: string } | null>(null);
	const [dropSlot, setDropSlot] = useState<number | null>(null);
	const dialog = useRef<HTMLDialogElement>(null);
	const search = useRef<HTMLInputElement>(null);
	const performance = location.pathname.startsWith("/perform/");
	const refresh = useCallback(() => {
		void Promise.all([getAllSongs(), getAllSetlists()])
			.then(([library, setlists]) => {
				setSongs(library.sort((a, b) => a.title.localeCompare(b.title)));
				setLists(setlists.sort((a, b) => a.name.localeCompare(b.name)));
				setError("");
			})
			.catch(() => setError("Could not load the library. Try again."));
	}, []);
	useEffect(() => {
		refresh();
		window.addEventListener("gig-dex-library-changed", refresh);
		window.addEventListener("focus", refresh);
		return () => {
			window.removeEventListener("gig-dex-library-changed", refresh);
			window.removeEventListener("focus", refresh);
		};
	}, [refresh]);
	useEffect(() => {
		const routeList = /^\/(?:setlist|perform\/setlist)\/([^/]+)/.exec(location.pathname)?.[1];
		if (routeList) {
			setChosen(routeList);
			remember("sidebar-current-setlist", routeList);
		}
		refresh();
	}, [location.pathname, refresh]);
	useEffect(() => {
		const shortcut = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "m") {
				event.preventDefault();
				setSearchOpen(true);
			}
		};
		window.addEventListener("keydown", shortcut);
		return () => window.removeEventListener("keydown", shortcut);
	}, []);
	useEffect(() => {
		if (searchOpen) {
			dialog.current?.showModal();
			search.current?.focus();
			search.current?.select();
		} else dialog.current?.close();
	}, [searchOpen]);
	const current = lists.find((list) => list.id === chosen);
	const changeSetlist = async (songId?: string, from?: number, to?: number, remove?: number) => {
		if (!current || busy) return;
		setBusy(true);
		try {
			const latest = await getSetlist(current.id);
			if (!latest) throw new Error("Setlist no longer exists");
			const ids = [...latest.songIds];
			const settings = occurrenceSettings(latest);
			if (songId) {
				const slot = to === undefined ? ids.length : Math.max(0, Math.min(to, ids.length));
				ids.splice(slot, 0, songId);
				settings.splice(slot, 0, { transpose: 0 });
			} else if (remove !== undefined && remove >= 0 && remove < ids.length) {
				ids.splice(remove, 1);
				settings.splice(remove, 1);
			} else if (
				from !== undefined &&
				from >= 0 &&
				from < ids.length &&
				to !== undefined &&
				to >= 0 &&
				to < ids.length
			) {
				const [id] = ids.splice(from, 1);
				ids.splice(to, 0, id);
				const [setting] = settings.splice(from, 1);
				settings.splice(to, 0, setting);
			}
			await updateSetlist(current.id, { songIds: ids, songSettings: settings });
			const params = new URLSearchParams(location.search);
			if (params.get("setlist") === current.id && params.has("occurrence")) {
				let index = Number(params.get("occurrence"));
				if (remove === index) {
					params.delete("setlist");
					params.delete("occurrence");
				} else {
					if (remove !== undefined && index > remove) index--;
					if (songId && to !== undefined && index >= to) index++;
					if (from !== undefined && to !== undefined) {
						if (index === from) index = to;
						else if (from < index && index <= to) index--;
						else if (to <= index && index < from) index++;
					}
					params.set("occurrence", String(index));
				}
				navigate(`${location.pathname}?${params}`, { replace: true });
			}
			setLists(await getAllSetlists());
		} catch {
			setError("Could not update the setlist. Please try again.");
		} finally {
			setBusy(false);
		}
	};
	const finishDrag = () => {
		dragged.current = null;
		setDropSlot(null);
	};
	const drop = (slot: number) => {
		const source = dragged.current;
		finishDrag();
		if (!source || busy || !current) return;
		if (source.songId) void changeSetlist(source.songId, undefined, slot);
		else if (source.listId === current.id && source.index !== undefined) {
			const to = slot > source.index ? slot - 1 : slot;
			if (to !== source.index) void changeSetlist(undefined, source.index, to);
		}
	};
	const songMap = new Map(songs.map((song) => [song.id, song]));
	const filteredSongs = songs.filter((song) =>
		matches([song.title, song.artist, ...song.tags].join(" "), songQuery),
	);
	const results = query.trim()
		? [
				...songs
					.filter((song) => matches([song.title, song.artist, ...song.tags].join(" "), query))
					.map((song) => ({
						id: song.id,
						label: song.title,
						detail: song.artist,
						type: "Song",
						url: `/song/${song.id}`,
					})),
				...lists
					.filter((list) =>
						matches(
							[list.name, list.date ?? "", list.description ?? "", ...(list.tags ?? [])].join(" "),
							query,
						),
					)
					.map((list) => ({
						id: list.id,
						label: list.name,
						detail: [list.date, ...(list.tags ?? [])].filter(Boolean).join(" · "),
						type: "Setlist",
						url: `/setlist/${list.id}`,
					})),
			]
		: [];
	const go = (url: string) => {
		navigate(url);
		if (window.matchMedia("(max-width: 800px)").matches) setOpen(false);
	};
	return (
		<>
			<header className="workspace-topbar">
				<button
					type="button"
					aria-label="Toggle sidebar"
					aria-controls="library-sidebar"
					aria-expanded={open && !performance}
					onClick={() => {
						const value = !open;
						setOpen(value);
						remember("sidebar-open", String(value));
					}}
				>
					☰
				</button>
				<Link to="/" className="workspace-brand home-page__title">
					Gig-Dex
				</Link>
				<nav aria-label="Main navigation">
					<NavLink
						to="/"
						end
						className={location.pathname.startsWith("/song/") ? "active" : undefined}
					>
						Songs
					</NavLink>
					<NavLink
						to="/setlists"
						className={location.pathname.startsWith("/setlist/") ? "active" : undefined}
					>
						Setlists
					</NavLink>
					<NavLink to="/settings">Settings</NavLink>
				</nav>
				<button
					className="workspace-search-button"
					type="button"
					onClick={() => setSearchOpen(true)}
				>
					Search songs & setlists <kbd>Ctrl+M</kbd>
				</button>
			</header>
			<div className="workspace-body" data-sidebar={open && !performance}>
				{open && !performance && (
					<>
						<button
							className="workspace-backdrop"
							type="button"
							aria-label="Close sidebar"
							onClick={() => setOpen(false)}
						/>
						<aside id="library-sidebar" className="library-sidebar" aria-label="Library sidebar">
							{error && (
								<p role="alert">
									{error}{" "}
									<button type="button" onClick={refresh}>
										Retry
									</button>
								</p>
							)}
							<section className="library-sidebar__section" data-expanded={songsExpanded}>
								<div className="library-sidebar__heading-row">
									<button
										className="library-sidebar__heading"
										type="button"
										aria-expanded={songsExpanded}
										aria-controls="sidebar-songs"
										onClick={() => {
											setSongsExpanded(!songsExpanded);
											remember("sidebar-songs", String(!songsExpanded));
										}}
									>
										Songs{" "}
										<span>
											{songs.length} {songsExpanded ? "▾" : "▸"}
										</span>
									</button>
									<Link
										to="/song/new"
										className="library-sidebar__add"
										aria-label="Add song"
										title="Add song"
									>
										+
									</Link>
								</div>
								{songsExpanded && (
									<div id="sidebar-songs" className="library-sidebar__panel">
										<input
											aria-label="Search sidebar songs"
											placeholder="Song, artist or tag…"
											value={songQuery}
											onChange={(event) => setSongQuery(event.target.value)}
										/>
										<div className="library-sidebar__links">
											{filteredSongs.map((song) => (
												<div key={song.id} className="library-sidebar__song-row">
													<Link
														to={`/song/${song.id}`}
														draggable={!!current && !busy}
														onDragStart={(event) => {
															dragged.current = { songId: song.id };
															event.dataTransfer.setData("text/plain", song.title);
															event.dataTransfer.effectAllowed = "copy";
														}}
														onDragEnd={finishDrag}
														aria-current={
															location.pathname === `/song/${song.id}` ? "page" : undefined
														}
														onClick={() => {
															if (window.matchMedia("(max-width: 800px)").matches) setOpen(false);
														}}
													>
														<strong>{song.title}</strong>
														<small>{song.artist}</small>
													</Link>
													{current && (
														<button
															type="button"
															disabled={busy}
															aria-label={`Add ${song.title} to current setlist`}
															onClick={() => void changeSetlist(song.id)}
														>
															+
														</button>
													)}
												</div>
											))}
											{!filteredSongs.length && (
												<p>{songs.length ? "No matching songs" : "No songs yet"}</p>
											)}
										</div>
									</div>
								)}
							</section>
							<section className="library-sidebar__section" data-expanded={listsExpanded}>
								<button
									className="library-sidebar__heading"
									type="button"
									aria-expanded={listsExpanded}
									aria-controls="sidebar-setlist"
									onClick={() => {
										setListsExpanded(!listsExpanded);
										remember("sidebar-setlist", String(!listsExpanded));
									}}
								>
									<span title={current?.name}>Setlist: {current?.name ?? "None selected"}</span>{" "}
									<span>{listsExpanded ? "▾" : "▸"}</span>
								</button>
								{listsExpanded && (
									// biome-ignore lint/a11y/noStaticElementInteractions: Drop target has equivalent add and reorder buttons.
									<div
										id="sidebar-setlist"
										className="library-sidebar__panel"
										data-drop-end={dropSlot === current?.songIds.length}
										onDragOver={(event) => {
											if (!dragged.current || !current || busy) return;
											event.preventDefault();
											setDropSlot(current.songIds.length);
										}}
										onDrop={(event) => {
											event.preventDefault();
											if (current) drop(current.songIds.length);
										}}
									>
										{current ? (
											<div className="library-sidebar__links">
												{current.songIds.map((id, index) => (
													// biome-ignore lint/a11y/noStaticElementInteractions: Drop target has equivalent reorder buttons.
													<div
														// biome-ignore lint/suspicious/noArrayIndexKey: Rows represent ordered occurrences.
														key={`${id}:${index}`}
														data-drop-before={dropSlot === index}
														onDragOver={(event) => {
															if (!dragged.current || busy) return;
															event.preventDefault();
															event.stopPropagation();
															const box = event.currentTarget.getBoundingClientRect();
															setDropSlot(index + (event.clientY > box.y + box.height / 2 ? 1 : 0));
														}}
														onDrop={(event) => {
															event.preventDefault();
															event.stopPropagation();
															drop(dropSlot ?? index);
														}}
														className="library-sidebar__song-row"
													>
														<Link
															to={`/song/${id}?setlist=${current.id}&occurrence=${index}`}
															draggable={!busy}
															onDragStart={(event) => {
																dragged.current = { index, listId: current.id };
																event.dataTransfer.setData(
																	"text/plain",
																	songMap.get(id)?.title ?? "Song",
																);
																event.dataTransfer.effectAllowed = "move";
															}}
															onDragEnd={finishDrag}
															onClick={() => {
																if (window.matchMedia("(max-width: 800px)").matches) setOpen(false);
															}}
														>
															<strong>
																{index + 1}. {songMap.get(id)?.title ?? "Missing song"}
															</strong>
															<small>
																{settingLabel(songMap.get(id), current.songSettings?.[index])}
															</small>
														</Link>
														<div className="library-sidebar__reorder">
															<button
																type="button"
																disabled={busy}
																aria-label={`Remove setlist song ${index + 1}`}
																title="Remove from setlist"
																onClick={() =>
																	void changeSetlist(undefined, undefined, undefined, index)
																}
															>
																×
															</button>
															<button
																type="button"
																disabled={busy || index === 0}
																aria-label={`Move setlist song ${index + 1} up`}
																onClick={() => void changeSetlist(undefined, index, index - 1)}
															>
																↑
															</button>
															<button
																type="button"
																disabled={busy || index === current.songIds.length - 1}
																aria-label={`Move setlist song ${index + 1} down`}
																onClick={() => void changeSetlist(undefined, index, index + 1)}
															>
																↓
															</button>
														</div>
													</div>
												))}
												{!current.songIds.length && <p>Drag songs here or use their + buttons.</p>}
											</div>
										) : (
											<Link
												to="/setlists"
												className="library-sidebar__action"
												onClick={() => {
													if (window.matchMedia("(max-width: 800px)").matches) setOpen(false);
												}}
											>
												Select a setlist
											</Link>
										)}
									</div>
								)}
							</section>
						</aside>
					</>
				)}
				<div className="app-route">
					<Suspense
						fallback={
							<div className="app-loading">
								<output>Loading…</output>
							</div>
						}
					>
						<Outlet />
					</Suspense>
				</div>
			</div>
			<dialog
				ref={dialog}
				className="workspace-search"
				aria-label="Search library"
				onCancel={(event) => {
					event.preventDefault();
					setSearchOpen(false);
				}}
			>
				<header>
					<h2>Search library</h2>
					<button type="button" aria-label="Close search" onClick={() => setSearchOpen(false)}>
						×
					</button>
				</header>
				<input
					ref={search}
					aria-label="Search songs and setlists"
					placeholder="Title, artist, description or tags…"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "ArrowDown") {
							event.preventDefault();
							dialog.current
								?.querySelector<HTMLAnchorElement>(".workspace-search__results a")
								?.focus();
						}
						if (event.key === "Enter" && results[0]) {
							setSearchOpen(false);
							go(results[0].url);
						}
					}}
				/>
				<output>
					{query.trim()
						? `${results.length} results`
						: "Search songs and setlists by title, artist, date or tags"}
				</output>
				<div className="workspace-search__results">
					{results.map((result) => (
						<Link
							key={`${result.type}:${result.id}`}
							to={result.url}
							onClick={() => {
								setSearchOpen(false);
								if (window.matchMedia("(max-width: 800px)").matches) setOpen(false);
							}}
						>
							<span className="workspace-search__type" data-type={result.type}>
								{result.type}
							</span>
							<span>
								<strong>{result.label}</strong>
								<small>{result.detail}</small>
							</span>
						</Link>
					))}
					{!!query.trim() && !results.length && <p>No matches. Try another title or tag.</p>}
				</div>
			</dialog>
		</>
	);
}
