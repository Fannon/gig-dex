import { useState } from "react";
import { Link } from "react-router-dom";
import { CloudSync } from "../components/CloudSync";
import { ConflictReview } from "../components/ConflictReview";
import { DataManagement } from "../components/DataManagement";
import { PwaSettings } from "../components/PwaSettings";
import { syncManager } from "../sync";
import type { SyncStatus } from "../sync/types";
import "./SettingsPage.scss";

export const SettingsPage = () => {
	const [syncStatus, setSyncStatus] = useState<SyncStatus>(syncManager.getStatus());

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
				<PwaSettings />
				<DataManagement />
				<ConflictReview status={syncStatus} />

				<CloudSync onStatus={setSyncStatus} />

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
