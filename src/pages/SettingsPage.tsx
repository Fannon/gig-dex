import { Link } from "react-router-dom";
import "./SettingsPage.scss";

export const SettingsPage = () => {
	const handleExport = async () => {
		// TODO: Implement export functionality
		alert("Export feature coming soon! This will export all your songs to a JSON file.");
	};

	const handleImport = () => {
		// TODO: Implement import functionality
		alert("Import feature coming soon! This will allow you to import songs from a JSON file.");
	};

	const handleGoogleDriveSync = () => {
		// TODO: Implement Google Drive sync
		alert("Google Drive sync coming soon! This will sync your songs across devices.");
	};

	return (
		<div className="settings-page">
			<header className="settings-page__header">
				<Link to="/" className="settings-page__back" aria-label="Go back">
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
				<h1>Settings</h1>
			</header>

			<main className="settings-page__content">
				<section className="settings-page__section">
					<h2>Data Management</h2>
					<div className="settings-page__options">
						<button type="button" onClick={handleExport} className="settings-page__option">
							<div className="settings-page__option-icon">
								<svg
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									aria-hidden="true"
								>
									<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
								</svg>
							</div>
							<div className="settings-page__option-text">
								<h3>Export Songs</h3>
								<p>Download all your songs as a JSON backup file</p>
							</div>
						</button>

						<button type="button" onClick={handleImport} className="settings-page__option">
							<div className="settings-page__option-icon">
								<svg
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									aria-hidden="true"
								>
									<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
								</svg>
							</div>
							<div className="settings-page__option-text">
								<h3>Import Songs</h3>
								<p>Import songs from a JSON backup file</p>
							</div>
						</button>
					</div>
				</section>

				<section className="settings-page__section">
					<h2>Cloud Sync</h2>
					<div className="settings-page__options">
						<button
							type="button"
							onClick={handleGoogleDriveSync}
							className="settings-page__option settings-page__option--coming-soon"
						>
							<div className="settings-page__option-icon settings-page__option-icon--gdrive">
								<svg
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="currentColor"
									aria-hidden="true"
								>
									<path d="M4.433 22l3.907-6.75h11.32L15.753 22H4.433zm3.907-6.75L.433 2h7.8l7.907 13.25H8.34zm7.907 0L8.24 2h7.8l7.907 13.25h-7.8z" />
								</svg>
							</div>
							<div className="settings-page__option-text">
								<h3>
									Google Drive Sync
									<span className="settings-page__badge">Coming Soon</span>
								</h3>
								<p>Sync your songs across all your devices</p>
							</div>
						</button>
					</div>
				</section>

				<section className="settings-page__section">
					<h2>About</h2>
					<div className="settings-page__about">
						<div className="settings-page__about-brand">
							<img src={`${import.meta.env.BASE_URL}pwa-192x192.png`} alt="Gig-Dex" />
							<div>
								<h3>Gig-Dex</h3>
								<p>Version 0.1.0</p>
							</div>
						</div>
						<p className="settings-page__about-description">
							A personal songbook and setlist manager for guitarists and musicians. Built with
							React, TypeScript, and IndexedDB for full offline support.
						</p>
						<div className="settings-page__about-links">
							<a href="https://www.chordpro.org/" target="_blank" rel="noopener noreferrer">
								Learn ChordPro Format
							</a>
						</div>
					</div>
				</section>
			</main>
		</div>
	);
};
