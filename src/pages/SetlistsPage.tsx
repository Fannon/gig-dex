import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { WorkspaceDialog } from "../components/WorkspaceDialog";
import {
	addSetlist,
	deleteSetlist,
	duplicateSetlist,
	getAllSetlists,
	getAllSongs,
	getSetlist,
	getSong,
	type Setlist,
	type SetlistSongSettings,
	type Song,
	updateSetlist,
} from "../db";
import { useUnsavedEdits } from "../hooks/useUnsavedEdits";
import { displayCalendarDate, isCalendarDate, localCalendarDate } from "../utils/calendarDate";
import { matchesLibrarySearch } from "../utils/librarySearch";
import {
	defaultSongSetting,
	occurrenceContent,
	occurrenceSettings,
	settingLabel,
} from "../utils/setlistSettings";
import { readSongDrag, songDragType, writeSongDrag } from "../utils/songDrag";
import "./SetlistsPage.scss";

const SongView = lazy(() =>
	import("../components/SongView").then((module) => ({ default: module.SongView })),
);

type Panel = "library" | "content" | "preview";
type Draft = {
	id?: string;
	name: string;
	tags: string;
	description: string;
	date: string;
	initialDate?: string;
};
const emptyDraft: Draft = { name: "", tags: "", description: "", date: "" };
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export const SetlistsPage = () => {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const routeSongIndex = Number(searchParams.get("song") ?? 0);
	const [setlists, setSetlists] = useState<Setlist[]>([]);
	const [songs, setSongs] = useState<Song[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const busyRef = useRef(false);
	const [dropSlot, setDropSlot] = useState<number | null>(null);
	const [search, setSearch] = useState(searchParams.get("q") ?? "");
	const [tag, setTag] = useState("");
	const [sort, setSort] = useState("updated");
	const [panel, setPanel] = useState<Panel>("library");
	const [songIndex, setSongIndex] = useState(0);
	const [previewKey, setPreviewKey] = useState<string | null>(null);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [addingSongs, setAddingSongs] = useState(false);
	const [songSearch, setSongSearch] = useState("");
	const routeQuery = searchParams.get("q") ?? "";
	useEffect(() => {
		setSearch(routeQuery);
	}, [routeQuery]);

	useEffect(() => {
		let cancelled = false;
		const load = () =>
			Promise.all([getAllSetlists(), getAllSongs()])
				.then(([lists, library]) => {
					if (!cancelled) {
						setSetlists(lists);
						setSongs(library);
						setLoading(false);
					}
				})
				.catch(() => {
					if (!cancelled) {
						setError("Could not load your library. Reload to try again.");
						setLoading(false);
					}
				});
		void load();
		window.addEventListener("gig-dex-library-changed", load);
		return () => {
			window.removeEventListener("gig-dex-library-changed", load);
			cancelled = true;
		};
	}, []);

	const ordered = [...setlists].sort((a, b) => {
		if (sort === "date")
			return (b.date ?? "").localeCompare(a.date ?? "") || collator.compare(a.name, b.name);
		if (sort === "name") return collator.compare(a.name, b.name) || a.id.localeCompare(b.id);
		if (sort === "name-desc") return collator.compare(b.name, a.name) || a.id.localeCompare(b.id);
		if (sort === "songs")
			return b.songIds.length - a.songIds.length || collator.compare(a.name, b.name);
		return b.lastModified.localeCompare(a.lastModified) || collator.compare(a.name, b.name);
	});
	const tags = [...new Set(setlists.flatMap((list) => list.tags ?? []))].sort(collator.compare);

	const filtered = ordered.filter((list) => {
		const text = [list.name, list.date ?? "", list.description ?? "", ...(list.tags ?? [])]
			.join(" ")
			.toLocaleLowerCase();
		return (
			(!tag || list.tags?.includes(tag)) &&
			matchesLibrarySearch(text, list.tags ?? [], search, list.songIds)
		);
	});
	const selected = setlists.find((list) => list.id === id) ?? (!id ? filtered[0] : undefined);
	const songMap = new Map(songs.map((song) => [song.id, song]));
	const preview = selected ? songMap.get(selected.songIds[songIndex]) : undefined;
	useEffect(() => {
		setSongIndex((index) => Math.max(0, Math.min(index, (selected?.songIds.length ?? 1) - 1)));
	}, [selected?.songIds.length]);
	const originalDraft = draft?.id ? setlists.find((list) => list.id === draft.id) : undefined;
	const dirtyDraft =
		!!draft &&
		(draft.name !== (originalDraft?.name ?? "") ||
			draft.tags !== (originalDraft?.tags?.join(", ") ?? "") ||
			draft.description !== (originalDraft?.description ?? "") ||
			draft.date !== (originalDraft?.date ?? draft.initialDate ?? ""));
	const allowLeave = useUnsavedEdits(dirtyDraft);
	const openNewDraft = () => {
		const date = localCalendarDate();
		setDraft({ ...emptyDraft, date, initialDate: date });
	};
	const closeDraft = () => {
		if (!dirtyDraft || confirm("Discard unsaved changes?")) {
			allowLeave();
			setDraft(null);
		}
	};
	const availableSongs = songs
		.filter((song) => {
			const text = [song.title, song.subtitle ?? "", song.artist, ...song.tags]
				.join(" ")
				.toLocaleLowerCase();
			return matchesLibrarySearch(text, song.tags, songSearch);
		})
		.sort((a, b) => collator.compare(a.title, b.title));

	const select = (listId: string, keepSearch = true) => {
		const params = new URLSearchParams();
		if (keepSearch && search.trim()) params.set("q", search.trim());
		navigate(`/setlist/${listId}${params.size ? `?${params}` : ""}`);
		setSongIndex(0);
		setPanel("content");
	};
	// Route navigation (including browser Back) resets occurrence selection.
	// biome-ignore lint/correctness/useExhaustiveDependencies: Route identity resets selection.
	useEffect(() => {
		setSongIndex(Number.isInteger(routeSongIndex) && routeSongIndex >= 0 ? routeSongIndex : 0);
		if (searchParams.has("song")) setPanel("preview");
	}, [id, routeSongIndex, searchParams]);

	const mutate = async (action: () => Promise<void>) => {
		if (busyRef.current) return;
		busyRef.current = true;
		setBusy(true);
		setError("");
		try {
			await action();
		} catch {
			setError("Could not save this change. Please try again.");
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	};
	const saveSongs = async (
		songIds: string[],
		index = songIndex,
		songSettings = selected ? occurrenceSettings(selected) : [],
	) => {
		if (!selected) return;
		await updateSetlist(selected.id, {
			songIds,
			songSettings: songIds.map(
				(id, index) => songSettings[index] ?? defaultSongSetting(songMap.get(id)),
			),
		});
		setSetlists(await getAllSetlists());
		setSongIndex(Math.max(0, Math.min(index, songIds.length - 1)));
	};
	const saveTranspose = (transpose: number) =>
		mutate(async () => {
			if (!selected) return;
			const latest = await getSetlist(selected.id);
			if (!latest || latest.songIds[songIndex] !== selected.songIds[songIndex])
				throw new Error("Set changed");
			const settings: SetlistSongSettings[] = occurrenceSettings(latest);
			settings[songIndex] = { ...settings[songIndex], transpose };
			await updateSetlist(selected.id, { songSettings: settings });
			setSetlists(await getAllSetlists());
		});
	const saveDraft = () =>
		mutate(async () => {
			if (!draft?.name.trim()) return;
			if (draft.date && !isCalendarDate(draft.date))
				throw new Error("Enter a valid date as YYYY-MM-DD.");
			const data = {
				name: draft.name.trim(),
				tags: [
					...new Set(
						draft.tags
							.split(",")
							.map((value) => value.trim())
							.filter(Boolean),
					),
				],
				description: draft.description.trim(),
				date: draft.date || undefined,
			};
			let listId = draft.id;
			if (listId) await updateSetlist(listId, data);
			else listId = await addSetlist({ ...data, songIds: [] });
			setSetlists(await getAllSetlists());
			allowLeave();
			setDraft(null);
			setSearch("");
			setTag("");
			select(listId, false);
		});
	const duplicate = () =>
		mutate(async () => {
			if (!selected) return;
			const base = `${selected.name} (copy)`;
			let name = base;
			let count = 2;
			while (setlists.some((list) => list.name === name)) name = `${base} ${count++}`;
			const listId = await duplicateSetlist(selected.id, name);
			setSetlists(await getAllSetlists());
			setSearch("");
			setTag("");
			select(listId, false);
		});
	const remove = () => {
		if (!selected || !confirm(`Delete “${selected.name}”? Your songs will stay in the library.`))
			return;
		void mutate(async () => {
			await deleteSetlist(selected.id);
			const remaining = await getAllSetlists();
			setSetlists(remaining);
			navigate(remaining.length ? `/setlist/${remaining[remaining.length - 1].id}` : "/setlists");
			setSongIndex(0);
			setPanel("library");
		});
	};
	const reorder = (from: number, to: number) =>
		mutate(async () => {
			if (!selected || to < 0 || to >= selected.songIds.length) return;
			const ids = [...selected.songIds];
			const [moved] = ids.splice(from, 1);
			ids.splice(to, 0, moved);
			const settings = occurrenceSettings(selected);
			const [setting] = settings.splice(from, 1);
			settings.splice(to, 0, setting);
			const next =
				songIndex === from
					? to
					: from < songIndex && songIndex <= to
						? songIndex - 1
						: to <= songIndex && songIndex < from
							? songIndex + 1
							: songIndex;
			await saveSongs(ids, next, settings);
		});

	const dropSong = (event: React.DragEvent, slot: number) => {
		event.preventDefault();
		event.stopPropagation();
		setDropSlot(null);
		const source = readSongDrag(event);
		if (!selected || !source) return;
		void mutate(async () => {
			const latest = await getSetlist(selected.id);
			if (!latest) throw new Error("Set no longer exists");
			const ids = [...latest.songIds];
			const settings = occurrenceSettings(latest);
			let next = songIndex;
			if (source.listId === latest.id && source.index !== undefined) {
				if (ids[source.index] !== source.songId) throw new Error("Set order changed during drag");
				const to = Math.min(slot > source.index ? slot - 1 : slot, ids.length - 1);
				if (to === source.index) return;
				const [moved] = ids.splice(source.index, 1);
				ids.splice(to, 0, moved);
				const [setting] = settings.splice(source.index, 1);
				settings.splice(to, 0, setting);
				next =
					songIndex === source.index
						? to
						: source.index < songIndex && songIndex <= to
							? songIndex - 1
							: to <= songIndex && songIndex < source.index
								? songIndex + 1
								: songIndex;
			} else {
				const added = await getSong(source.songId);
				if (!added) throw new Error("Song no longer exists");
				const to = Math.max(0, Math.min(slot, ids.length));
				ids.splice(to, 0, added.id);
				settings.splice(to, 0, defaultSongSetting(added));
				if (ids.length > 1 && songIndex >= to) next++;
			}
			await saveSongs(ids, next, settings);
		});
	};
	const dragOver = (event: React.DragEvent, slot: number) => {
		if (busyRef.current || !event.dataTransfer.types.includes(songDragType)) return;
		event.preventDefault();
		event.stopPropagation();
		setDropSlot(slot);
	};

	return (
		<div className="setlists-page" data-panel={panel}>
			<header className="setlists-page__header">
				<h1>Sets</h1>
				<button type="button" className="setlists-page__add primary" onClick={() => openNewDraft()}>
					New setlist
				</button>
			</header>
			{error && (
				<p className="setlists-page__error" role="alert">
					{error}
				</p>
			)}
			<nav className="setlists-page__tabs" aria-label="Setlist panels">
				{(
					[
						["library", "Sets"],
						["content", "Songs"],
						["preview", "Preview"],
					] as const
				).map(([value, label]) => (
					<button
						type="button"
						key={value}
						aria-pressed={panel === value}
						onClick={() => setPanel(value)}
					>
						{label}
					</button>
				))}
			</nav>
			<main className="setlists-page__workspace" aria-busy={loading}>
				<section className="setlists-page__library" aria-label="Setlist library">
					<div className="setlists-page__panel-heading">
						<h2>Your setlists</h2>
						<span>{setlists.length}</span>
					</div>
					<div className="setlists-page__filters">
						<label className="sr-only" htmlFor="setlist-search">
							Search setlists
						</label>
						<input
							id="setlist-search"
							type="search"
							placeholder="Search names, tags, descriptions…"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
						/>
						<div className="setlists-page__filter-row">
							<label>
								Sort
								<select
									aria-label="Sort"
									value={sort}
									onChange={(event) => setSort(event.target.value)}
								>
									<option value="updated">Recently updated</option>
									<option value="date">Gig date (newest first)</option>
									<option value="name">Name A–Z</option>
									<option value="name-desc">Name Z–A</option>
									<option value="songs">Most songs</option>
								</select>
							</label>
							<label>
								Tags
								<select
									aria-label="Tags"
									value={tag}
									onChange={(event) => setTag(event.target.value)}
								>
									<option value="">All tags</option>
									{tags.map((value) => (
										<option key={value}>{value}</option>
									))}
								</select>
							</label>
						</div>
					</div>
					<div className="setlists-page__list">
						{loading ? (
							<p className="setlists-page__empty">Loading setlists…</p>
						) : !setlists.length ? (
							<div className="setlists-page__empty">
								<h3>No setlists yet</h3>
								<p>Create a setlist for your next gig.</p>
								<button type="button" className="primary" onClick={() => openNewDraft()}>
									Create Setlist
								</button>
							</div>
						) : !filtered.length ? (
							<p className="setlists-page__empty">No matching setlists. Try another name or tag.</p>
						) : (
							filtered.map((list) => (
								<button
									type="button"
									key={list.id}
									className="setlists-page__item"
									aria-pressed={selected?.id === list.id}
									onClick={() => select(list.id)}
								>
									<h3>{list.name}</h3>
									<p>
										{list.songIds.length} {list.songIds.length === 1 ? "song" : "songs"} ·{" "}
										{list.date
											? displayCalendarDate(list.date)
											: new Date(list.lastModified).toLocaleDateString()}
									</p>
									{list.description && (
										<p className="setlists-page__description">{list.description}</p>
									)}
									<div className="setlists-page__tags">
										{list.tags?.map((value) => (
											<span key={value}>{value}</span>
										))}
									</div>
								</button>
							))
						)}
					</div>
				</section>
				<section className="setlists-page__content" aria-label="Setlist content">
					{selected ? (
						<>
							<div className="setlists-page__detail-header">
								<div className="setlists-page__eyebrow">
									SETLIST · {selected.songIds.length} SONGS
									{selected.date && (
										<>
											{" "}
											· <time dateTime={selected.date}>{displayCalendarDate(selected.date)}</time>
										</>
									)}
								</div>
								<h2>{selected.name}</h2>
								{selected.description && <p>{selected.description}</p>}
								{!!selected.tags?.length && (
									<div className="setlists-page__tags">
										{selected.tags?.map((value) => (
											<span key={value}>{value}</span>
										))}
									</div>
								)}
								<div className="setlists-page__actions">
									{selected.songIds.length > 0 && (
										<Link className="setlists-page__perform" to={`/perform/setlist/${selected.id}`}>
											Perform setlist ↗
										</Link>
									)}
									<button
										type="button"
										disabled={busy}
										onClick={() =>
											setDraft({
												id: selected.id,
												name: selected.name,
												tags: selected.tags?.join(", ") ?? "",
												description: selected.description ?? "",
												date: selected.date ?? "",
											})
										}
									>
										Edit details
									</button>
									<button type="button" disabled={busy} onClick={duplicate}>
										Duplicate
									</button>
									<button type="button" className="danger" disabled={busy} onClick={remove}>
										Delete setlist
									</button>
									<button
										type="button"
										className="primary"
										disabled={busy}
										onClick={() => {
											setSongSearch("");
											setAddingSongs(true);
										}}
									>
										Add songs
									</button>
								</div>
							</div>
							<ol
								className="setlists-page__songs"
								onDragOver={(event) => dragOver(event, selected.songIds.length)}
								onDrop={(event) => dropSong(event, selected.songIds.length)}
								onDragLeave={(event) => {
									if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropSlot(null);
								}}
							>
								{!selected.songIds.length && (
									<li className="setlists-page__empty">No songs in this setlist</li>
								)}
								{selected.songIds.map((songId, index) => {
									const song = songMap.get(songId);
									return (
										<li
											// biome-ignore lint/suspicious/noArrayIndexKey: Stateless rows represent ordered occurrences, including repeated song IDs.
											key={`${songId}-${index}`}
											className="setlists-page__song"
											data-selected={songIndex === index}
											data-drop-before={dropSlot === index}
											data-drop-after={
												index === selected.songIds.length - 1 && dropSlot === index + 1
											}
										>
											<button
												type="button"
												className="setlists-page__song-select"
												draggable={!busy}
												title="Drag to reorder"
												onDragStart={(event) =>
													writeSongDrag(
														event,
														{ songId, listId: selected.id, index },
														song?.title ?? "Song",
													)
												}
												onDragEnd={() => setDropSlot(null)}
												onDragOver={(event) => {
													const box = event.currentTarget.closest("li")?.getBoundingClientRect();
													dragOver(
														event,
														index + (box && event.clientY > box.y + box.height / 2 ? 1 : 0),
													);
												}}
												onDrop={(event) => dropSong(event, dropSlot ?? index)}
												onClick={() => {
													setSongIndex(index);
													setPanel("preview");
												}}
												aria-pressed={songIndex === index}
											>
												<span className="setlists-page__song-number">{index + 1}</span>
												<span>
													<strong>{song?.title ?? "Missing song"}</strong>
													<small>{song?.artist ?? "This song is no longer in your library"}</small>
													<small>{settingLabel(song, selected.songSettings?.[index])}</small>
												</span>
											</button>
											<div className="setlists-page__song-actions">
												<button
													type="button"
													disabled={busy || index === 0}
													aria-label={`Move song ${index + 1} up`}
													onClick={() => void reorder(index, index - 1)}
												>
													↑
												</button>
												<button
													type="button"
													disabled={busy || index === selected.songIds.length - 1}
													aria-label={`Move song ${index + 1} down`}
													onClick={() => void reorder(index, index + 1)}
												>
													↓
												</button>
												<button
													type="button"
													className="danger"
													disabled={busy}
													aria-label={`Remove song ${index + 1}`}
													onClick={() =>
														void mutate(() =>
															saveSongs(
																selected.songIds.filter((_, position) => position !== index),
																songIndex > index ? songIndex - 1 : songIndex,
																occurrenceSettings(selected).filter(
																	(_, position) => position !== index,
																),
															),
														)
													}
												>
													×
												</button>
											</div>
										</li>
									);
								})}
								<li
									className="setlists-page__drop-end"
									data-active={dropSlot === selected.songIds.length}
								>
									Drop here to append a song
								</li>
								<li
									className="setlists-page__drop-remove"
									onDragOver={(event) => dragOver(event, -1)}
									data-active={dropSlot === -1}
									onDrop={(event) => {
										event.preventDefault();
										event.stopPropagation();
										setDropSlot(null);
										const source = readSongDrag(event);
										if (source?.listId !== selected.id || source.index === undefined) return;
										const removedIndex = source.index;
										void mutate(async () => {
											const latest = await getSetlist(selected.id);
											if (!latest || latest.songIds[removedIndex] !== source.songId)
												throw new Error("Set order changed during drag");
											await saveSongs(
												latest.songIds.filter((_, i) => i !== source.index),
												songIndex > removedIndex ? songIndex - 1 : songIndex,
												occurrenceSettings(latest).filter((_, i) => i !== source.index),
											);
										});
									}}
								>
									Drop here to remove
								</li>
							</ol>
						</>
					) : (
						<div className="setlists-page__empty">
							{id && !loading
								? "This setlist no longer exists. Select another setlist."
								: "Select a setlist to start planning."}
						</div>
					)}
				</section>
				<section className="setlists-page__preview" aria-label="Song preview">
					{preview ? (
						<>
							<header className="setlists-page__preview-header">
								<div className="setlists-page__preview-heading">
									<div className="setlists-page__eyebrow">SONG PREVIEW</div>
									<Link to={`/song/${preview.id}?setlist=${selected?.id}&occurrence=${songIndex}`}>
										Open song ↗
									</Link>
								</div>
								<h2>{preview.title}</h2>
								<p>
									{preview.artist}
									{previewKey ? ` · ${previewKey}` : ""}
								</p>
							</header>
							<Suspense fallback={<output className="setlists-page__empty">Loading song…</output>}>
								<SongView
									key={`${selected?.id}:${songIndex}:${preview.id}`}
									content={occurrenceContent(preview, selected?.songSettings?.[songIndex])}
									transposeValue={selected?.songSettings?.[songIndex]?.transpose ?? 0}
									onTransposeChange={(transpose) => void saveTranspose(transpose)}
									fitToScreen={false}
									onKeyChange={setPreviewKey}
								/>
							</Suspense>
						</>
					) : (
						<div className="setlists-page__empty">
							<h2>Song preview</h2>
							<p>Select a song to see its lyrics and chords.</p>
						</div>
					)}
				</section>
			</main>
			{draft && (
				<WorkspaceDialog title={draft.id ? "Edit setlist" : "New Setlist"} onClose={closeDraft}>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void saveDraft();
						}}
					>
						<label>
							Name
							<input
								required
								placeholder="Setlist name"
								value={draft.name}
								onChange={(event) => setDraft({ ...draft, name: event.target.value })}
							/>
						</label>
						<label>
							Date
							<input
								type="text"
								placeholder="YYYY-MM-DD"
								inputMode="numeric"
								pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
								maxLength={10}
								value={draft.date}
								onChange={(event) => {
									const date = event.target.value;
									event.target.setCustomValidity(
										date && !isCalendarDate(date) ? "Enter a valid date as YYYY-MM-DD." : "",
									);
									setDraft({ ...draft, date });
								}}
							/>
						</label>
						<label>
							Tags
							<input
								aria-label="Tags"
								placeholder="e.g. acoustic, wedding"
								value={draft.tags}
								onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
							/>
							<small>Separate tags with commas.</small>
						</label>
						<label>
							Description
							<textarea
								rows={3}
								value={draft.description}
								onChange={(event) => setDraft({ ...draft, description: event.target.value })}
							/>
						</label>
						<div className="setlists-page__modal-actions">
							<button type="button" onClick={closeDraft}>
								Cancel
							</button>
							<button type="submit" className="primary" disabled={busy || !draft.name.trim()}>
								{draft.id ? "Save changes" : "Create"}
							</button>
						</div>
					</form>
				</WorkspaceDialog>
			)}
			{addingSongs && (
				<WorkspaceDialog title="Add songs" onClose={() => setAddingSongs(false)}>
					<label>
						Search songs
						<input
							type="search"
							placeholder="Title, artist, or tag"
							value={songSearch}
							onChange={(event) => setSongSearch(event.target.value)}
						/>
					</label>
					<p className="setlists-page__hint">
						Add multiple songs, including repeats. Your song library stays unchanged.
					</p>
					<ul className="setlists-page__picker">
						{availableSongs.map((song) => (
							<li key={song.id}>
								<span>
									<strong>{song.title}</strong>
									<small>{song.artist}</small>
								</span>
								<button
									type="button"
									className="primary"
									disabled={busy}
									aria-label={`Add ${song.title}`}
									onClick={() =>
										void mutate(() => saveSongs([...(selected?.songIds ?? []), song.id]))
									}
								>
									Add{selected?.songIds.includes(song.id) ? " again" : ""}
								</button>
							</li>
						))}
					</ul>
					{!availableSongs.length && <p>No matching songs. Add songs to your library first.</p>}
					<div className="setlists-page__modal-actions">
						<button type="button" onClick={() => setAddingSongs(false)}>
							Done
						</button>
					</div>
				</WorkspaceDialog>
			)}
		</div>
	);
};
