import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isGDriveAuthenticated, isGDriveEnabled, syncManager } from "../sync";
import type { SyncStatus } from "../sync/types";
import "./SettingsPage.scss";

export const SettingsPage = () => {
	const [syncStatus, setSyncStatus] = useState<SyncStatus>(syncManager.getStatus());
	const [isGdriveConnected, setIsGdriveConnected] = useState(isGDriveAuthenticated());
	const gdriveEnabled = isGDriveEnabled();

	useEffect(() => {
		// Update status periodically if syncing
		let interval: number;
		if (syncStatus.isSyncing) {
			interval = window.setInterval(() => {
				setSyncStatus(syncManager.getStatus());
			}, 500);
		}
		return () => clearInterval(interval);
	}, [syncStatus.isSyncing]);

	const handleExport = async () => {
		// Existing implementation...
		alert("Export feature coming soon!");
	};

	const handleImport = () => {
		alert("Import feature coming soon!");
	};

	const handleConnectGDrive = async () => {
		try {
			await syncManager.sync();
			setSyncStatus(syncManager.getStatus());
			setIsGdriveConnected(!!localStorage.getItem("gdrive_access_token"));
		} catch (error) {
			console.error("Connection failed", error);
		}
	};

	const handleSync = async () => {
		await syncManager.sync();
		setSyncStatus(syncManager.getStatus());
	};

	const handleLogoutGDrive = () => {
		localStorage.removeItem("gdrive_access_token");
		localStorage.removeItem("last_sync_time");
		setIsGdriveConnected(false);
		setSyncStatus(syncManager.getStatus());
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
						{!gdriveEnabled ? (
							<div className="settings-page__option settings-page__option--disabled">
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
									<h3>Google Drive Sync</h3>
									<p>Not configured. A Google Client ID is required to enable sync.</p>
								</div>
							</div>
						) : !isGdriveConnected ? (
							<button type="button" onClick={handleConnectGDrive} className="settings-page__option">
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
									<h3>Connect Google Drive</h3>
									<p>Backup and sync your songs across devices</p>
								</div>
							</button>
						) : (
							<div className="settings-page__sync-box">
								<div className="settings-page__option">
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
										<h3>Google Drive Connected</h3>
										<p>
											{syncStatus.lastSyncTime
												? `Last synced: ${new Date(syncStatus.lastSyncTime).toLocaleString()}`
												: "Never synced"}
										</p>
									</div>
									<div className="settings-page__option-actions">
										<button
											type="button"
											className={`settings-page__sync-btn ${syncStatus.isSyncing ? "settings-page__sync-btn--syncing" : ""}`}
											onClick={handleSync}
											disabled={syncStatus.isSyncing}
										>
											{syncStatus.isSyncing ? "Syncing..." : "Sync Now"}
										</button>
										<button
											type="button"
											className="settings-page__logout-btn"
											onClick={handleLogoutGDrive}
										>
											Disconnect
										</button>
									</div>
								</div>
								{syncStatus.error && (
									<div className="settings-page__sync-error">{syncStatus.error}</div>
								)}
							</div>
						)}
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
