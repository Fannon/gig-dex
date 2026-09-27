import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addSong, getAllSongs } from "../db";
import { DEMO_SONG } from "../utils/demoSong";
import "./HomePage.scss";

export const HomePage = () => {
	const navigate = useNavigate();
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	useEffect(() => {
		let cancelled = false;
		void getAllSongs()
			.then((songs) => {
				if (cancelled) return;
				if (songs.length) navigate(`/song/${songs[songs.length - 1].id}`, { replace: true });
				else setLoading(false);
			})
			.catch(() => {
				if (!cancelled) {
					setLoading(false);
					setError("Could not load your songs. Reload to try again.");
				}
			});
		return () => {
			cancelled = true;
		};
	}, [navigate]);
	const addDemo = async () => {
		try {
			const id = await addSong({
				title: "Amazing Grace",
				artist: "Traditional",
				content: DEMO_SONG,
				key: "G",
				tags: ["hymn", "classic", "worship"],
			});
			navigate(`/song/${id}`);
		} catch {
			setError("Could not add the song. Please try again.");
		}
	};
	return (
		<div className="home-page">
			<main className="home-page__content">
				{error && <p role="alert">{error}</p>}
				{loading ? (
					<output>Loading songs…</output>
				) : (
					<div className="home-page__empty">
						<h1>No songs yet</h1>
						<p>Add your first song to get started</p>
						<button type="button" onClick={() => void addDemo()} className="home-page__demo-btn">
							Add Demo Song
						</button>
					</div>
				)}
			</main>
			<Link to="/song/new" className="home-page__fab" aria-label="Add song">
				+
			</Link>
		</div>
	);
};
