import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SongCard } from "../components/SongCard";
import { addSong, deleteSong, getAllSongs, type Song } from "../db";
import { DEMO_SONG } from "../utils/chordEngine";
import "./HomePage.scss";

export const HomePage = () => {
	const [songs, setSongs] = useState<Song[]>([]);
	const [searchQuery, setSearchQuery] = useState("");
	const [loading, setLoading] = useState(true);

	const loadSongs = useCallback(async () => {
		try {
			const allSongs = await getAllSongs();
			setSongs(allSongs.reverse()); // Most recent first
		} catch (error) {
			console.error("Failed to load songs:", error);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadSongs();
	}, [loadSongs]);

	const handleDelete = async (id: number) => {
		if (confirm("Are you sure you want to delete this song?")) {
			await deleteSong(id);
			loadSongs();
		}
	};

	const handleAddDemo = async () => {
		await addSong({
			title: "Amazing Grace",
			artist: "Traditional",
			content: DEMO_SONG,
			key: "G",
			tags: ["hymn", "classic", "worship"],
		});
		loadSongs();
	};

	const filteredSongs = songs.filter((song) => {
		if (!searchQuery) return true;
		const query = searchQuery.toLowerCase();
		return (
			song.title.toLowerCase().includes(query) ||
			song.artist.toLowerCase().includes(query) ||
			song.tags.some((tag) => tag.toLowerCase().includes(query))
		);
	});

	return (
		<div className="home-page">
			<header className="home-page__header">
				<div className="home-page__brand">
					<img
						src={`${import.meta.env.BASE_URL}pwa-192x192.png`}
						alt="Gig-Dex"
						className="home-page__logo"
					/>
					<h1 className="home-page__title">Gig-Dex</h1>
				</div>

				<div className="home-page__search">
					<svg
						className="home-page__search-icon"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						aria-hidden="true"
					>
						<circle cx="11" cy="11" r="8" />
						<path d="M21 21l-4.35-4.35" />
					</svg>
					<input
						type="text"
						placeholder="Search songs, artists, or tags..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="home-page__search-input"
					/>
				</div>

				<nav className="home-page__nav">
					<Link to="/" className="home-page__nav-item home-page__nav-item--active">
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							aria-hidden="true"
						>
							<path d="M9 18V5l12-2v13" />
							<circle cx="6" cy="18" r="3" />
							<circle cx="18" cy="16" r="3" />
						</svg>
						Songs
					</Link>
					<Link to="/setlists" className="home-page__nav-item">
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							aria-hidden="true"
						>
							<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
						</svg>
						Setlists
					</Link>
					<Link to="/settings" className="home-page__nav-item">
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							aria-hidden="true"
						>
							<circle cx="12" cy="12" r="3" />
							<path d="M12 1v6m0 6v10M4.22 4.22l4.24 4.24m7.08 7.08l4.24 4.24M1 12h6m6 0h10M4.22 19.78l4.24-4.24m7.08-7.08l4.24-4.24" />
						</svg>
						Settings
					</Link>
				</nav>
			</header>

			<main className="home-page__content">
				{loading ? (
					<div className="home-page__loading">
						<div className="home-page__spinner"></div>
						<p>Loading songs...</p>
					</div>
				) : filteredSongs.length === 0 ? (
					<div className="home-page__empty">
						{songs.length === 0 ? (
							<>
								<svg
									width="64"
									height="64"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
									aria-hidden="true"
								>
									<path d="M9 18V5l12-2v13" />
									<circle cx="6" cy="18" r="3" />
									<circle cx="18" cy="16" r="3" />
								</svg>
								<h2>No songs yet</h2>
								<p>Add your first song to get started</p>
								<button type="button" onClick={handleAddDemo} className="home-page__demo-btn">
									Add Demo Song
								</button>
							</>
						) : (
							<p>No songs match "{searchQuery}"</p>
						)}
					</div>
				) : (
					<div className="home-page__songs">
						{filteredSongs.map((song) => (
							<SongCard key={song.id} song={song} onDelete={handleDelete} />
						))}
					</div>
				)}
			</main>

			<Link to="/song/new" className="home-page__fab">
				<svg
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					aria-hidden="true"
				>
					<path d="M12 5v14M5 12h14" />
				</svg>
			</Link>
		</div>
	);
};
