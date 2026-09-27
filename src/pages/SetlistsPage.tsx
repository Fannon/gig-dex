import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { WorkspaceDialog } from "../components/WorkspaceDialog";
import {
	addSetlist,
	deleteSetlist,
	duplicateSetlist,
	getAllSetlists,
	getAllSongs,
	type Setlist,
	type Song,
	updateSetlist,
} from "../db";
import { useUnsavedEdits } from "../hooks/useUnsavedEdits";
import "./SetlistsPage.scss";

const SongView = lazy(() =>
	import("../components/SongView").then((module) => ({ default: module.SongView })),
);

type Panel = "library" | "content" | "preview";
type Draft = { id?: string; name: string; tags: string; description: string };
const emptyDraft: Draft = { name: "", tags: "", description: "" };
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export const SetlistsPage = () => {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const [setlists, setSetlists] = useState<Setlist[]>([]);
	const [songs, setSongs] = useState<Song[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [search, setSearch] = useState("");
	const [tag, setTag] = useState("");
	const [sort, setSort] = useState("updated");
	const [panel, setPanel] = useState<Panel>("library");
	const [songIndex, setSongIndex] = useState(0);
	const [previewKey, setPreviewKey] = useState<string | null>(null);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [addingSongs, setAddingSongs] = useState(false);
	const [songSearch, setSongSearch] = useState("");

	useEffect(() => {
		let cancelled = false;
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
		return () => {
			cancelled = true;
		};
	}, []);

	const ordered = [...setlists].sort((a, b) => {
		if (sort === "name") return collator.compare(a.name, b.name) || a.id.localeCompare(b.id);
		if (sort === "name-desc") return collator.compare(b.name, a.name) || a.id.localeCompare(b.id);
		if (sort === "songs")
			return b.songIds.length - a.songIds.length || collator.compare(a.name, b.name);
		return b.lastModified.localeCompare(a.lastModified) || collator.compare(a.name, b.name);
	});
	const selected = setlists.find((list) => list.id === id) ?? (!id ? ordered[0] : undefined);
	const tags = [...new Set(setlists.flatMap((list) => list.tags ?? []))].sort(collator.compare);
	const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
	const filtered = ordered.filter((list) => {
		const text = [list.name, list.description ?? "", ...(list.tags ?? [])]
			.join(" ")
			.toLocaleLowerCase();
		return (!tag || list.tags?.includes(tag)) && terms.every((term) => text.includes(term));
	});
	const songMap = new Map(songs.map((song) => [song.id, song]));
	const preview = selected ? songMap.get(selected.songIds[songIndex]) : undefined;
	const originalDraft = draft?.id ? setlists.find((list) => list.id === draft.id) : undefined;
	const dirtyDraft =
		!!draft &&
		(draft.name !== (originalDraft?.name ?? "") ||
			draft.tags !== (originalDraft?.tags?.join(", ") ?? "") ||
			draft.description !== (originalDraft?.description ?? ""));
	const allowLeave = useUnsavedEdits(dirtyDraft);
	const closeDraft = () => {
		if (!dirtyDraft || confirm("Discard unsaved changes?")) {
			allowLeave();
			setDraft(null);
		}
	};
	const availableSongs = songs
		.filter((song) => {
			const text = [song.title, song.artist, ...song.tags].join(" ").toLocaleLowerCase();
			return songSearch
				.trim()
				.toLocaleLowerCase()
				.split(/\s+/)
				.every((term) => text.includes(term));
		})
		.sort((a, b) => collator.compare(a.title, b.title));

	const select = (listId: string) => {
		navigate(`/setlist/${listId}`);
		setSongIndex(0);
		setPanel("content");
	};
	// Route navigation (including browser Back) resets occurrence selection.
	// biome-ignore lint/correctness/useExhaustiveDependencies: Route identity resets selection.
	useEffect(() => {
		setSongIndex(0);
	}, [id]);

	const mutate = async (action: () => Promise<void>) => {
		if (busy) return;
		setBusy(true);
		setError("");
		try {
			await action();
		} catch {
			setError("Could not save this change. Please try again.");
		} finally {
			setBusy(false);
		}
	};
	const saveSongs = async (songIds: string[], index = songIndex) => {
		if (!selected) return;
		await updateSetlist(selected.id, { songIds });
		setSetlists(await getAllSetlists());
		setSongIndex(Math.max(0, Math.min(index, songIds.length - 1)));
	};
	const saveDraft = () =>
		mutate(async () => {
			if (!draft?.name.trim()) return;
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
			};
			let listId = draft.id;
			if (listId) await updateSetlist(listId, data);
			else listId = await addSetlist({ ...data, songIds: [] });
			setSetlists(await getAllSetlists());
			allowLeave();
			setDraft(null);
			setSearch("");
			setTag("");
			select(listId);
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
			select(listId);
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
			const next = songIndex === from ? to : songIndex === to ? from : songIndex;
			await saveSongs(ids, next);
		});

	return (
		<div className="setlists-page" data-panel={panel}>
			<header className="setlists-page__header">
				<Link to="/" className="setlists-page__back">
					← Songs
				</Link>
				<h1>Setlists</h1>
				<button
					type="button"
					className="setlists-page__add primary"
					onClick={() => setDraft({ ...emptyDraft })}
				>
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
						["library", "Setlists"],
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
								<button
									type="button"
									className="primary"
									onClick={() => setDraft({ ...emptyDraft })}
								>
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
										{new Date(list.lastModified).toLocaleDateString()}
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
								</div>
								<h2>{selected.name}</h2>
								{selected.description && <p>{selected.description}</p>}
								<div className="setlists-page__tags">
									{selected.tags?.map((value) => (
										<span key={value}>{value}</span>
									))}
								</div>
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
								</div>
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
							<ol className="setlists-page__songs">
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
										>
											<button
												type="button"
												className="setlists-page__song-select"
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
								<div className="setlists-page__eyebrow">SONG PREVIEW</div>
								<h2>{preview.title}</h2>
								<p>
									{preview.artist}
									{previewKey ? ` · ${previewKey}` : ""}
								</p>

								<Link to={`/song/${preview.id}`}>Open song ↗</Link>
							</header>
							<Suspense fallback={<output className="setlists-page__empty">Loading song…</output>}>
								<SongView
									key={preview.id}
									content={preview.content}
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
