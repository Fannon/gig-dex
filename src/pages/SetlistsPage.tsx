import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { addSetlist, deleteSetlist, getAllSetlists, type Setlist } from "../db";
import "./SetlistsPage.scss";

export const SetlistsPage = () => {
	const [setlists, setSetlists] = useState<Setlist[]>([]);
	const [loading, setLoading] = useState(true);
	const [showModal, setShowModal] = useState(false);
	const [newSetlistName, setNewSetlistName] = useState("");

	const loadSetlists = useCallback(async () => {
		try {
			const all = await getAllSetlists();
			setSetlists(all.reverse());
		} catch (error) {
			console.error("Failed to load setlists:", error);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadSetlists();
	}, [loadSetlists]);

	const handleDelete = async (id: number) => {
		if (confirm("Are you sure you want to delete this setlist?")) {
			await deleteSetlist(id);
			loadSetlists();
		}
	};

	const handleCreate = async () => {
		if (!newSetlistName.trim()) return;

		await addSetlist({
			name: newSetlistName.trim(),
			songIds: [],
		});

		setNewSetlistName("");
		setShowModal(false);
		loadSetlists();
	};

	return (
		<div className="setlists-page">
			<header className="setlists-page__header">
				<Link to="/" className="setlists-page__back" aria-label="Go back">
					<svg
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						aria-hidden="true"
					>
						<path d="M19 12H5M12 19l-7-7 7-7" />
					</svg>
				</Link>
				<h1>Setlists</h1>
				<button
					type="button"
					onClick={() => setShowModal(true)}
					className="setlists-page__add"
					aria-label="Add setlist"
				>
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						aria-hidden="true"
					>
						<path d="M12 5v14M5 12h14" />
					</svg>
				</button>
			</header>

			<main className="setlists-page__content">
				{loading ? (
					<div className="setlists-page__loading">
						<div className="setlists-page__spinner"></div>
						<p>Loading setlists...</p>
					</div>
				) : setlists.length === 0 ? (
					<div className="setlists-page__empty">
						<svg
							width="64"
							height="64"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
						>
							<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
						</svg>
						<h2>No setlists yet</h2>
						<p>Create your first setlist to organize songs for your gigs</p>
						<button onClick={() => setShowModal(true)} className="setlists-page__create-btn">
							Create Setlist
						</button>
					</div>
				) : (
					<div className="setlists-page__list">
						{setlists.map((setlist) => (
							<Link key={setlist.id} to={`/setlist/${setlist.id}`} className="setlists-page__item">
								<div className="setlists-page__item-content">
									<h3>{setlist.name}</h3>
									<p>
										{setlist.songIds.length} song{setlist.songIds.length !== 1 ? "s" : ""}
									</p>
								</div>
								<button
									className="setlists-page__item-delete"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										if (setlist.id) handleDelete(setlist.id);
									}}
								>
									<svg
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
									>
										<path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
									</svg>
								</button>
							</Link>
						))}
					</div>
				)}
			</main>

			{showModal && (
				<div className="setlists-page__modal-overlay" onClick={() => setShowModal(false)}>
					<div className="setlists-page__modal" onClick={(e) => e.stopPropagation()}>
						<h2>New Setlist</h2>
						<input
							type="text"
							value={newSetlistName}
							onChange={(e) => setNewSetlistName(e.target.value)}
							placeholder="Setlist name"
							onKeyDown={(e) => e.key === "Enter" && handleCreate()}
						/>
						<div className="setlists-page__modal-actions">
							<button
								onClick={() => setShowModal(false)}
								className="setlists-page__modal-btn--secondary"
							>
								Cancel
							</button>
							<button onClick={handleCreate} className="setlists-page__modal-btn--primary">
								Create
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
