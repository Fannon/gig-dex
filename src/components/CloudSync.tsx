import { useState } from "react";
import { syncHosts } from "../sync";
import type { SyncStatus } from "../sync/types";
import { RevisionCleanup } from "./RevisionCleanup";

const Host = ({
	host,
	onStatus,
}: {
	host: (typeof syncHosts)[number];
	onStatus: (status: SyncStatus) => void;
}) => {
	const { provider, manager } = host;
	const [status, setStatus] = useState(manager.getStatus());
	const [connected, setConnected] = useState(provider.isAuthenticated());
	const [busy, setBusy] = useState(false);
	const update = () => {
		const value = manager.getStatus();
		setStatus(value);
		onStatus(value);
		setConnected(provider.isAuthenticated());
	};
	const sync = async () => {
		setBusy(true);
		try {
			const pending = manager.sync();
			update();
			await pending;
			update();
		} finally {
			setBusy(false);
		}
	};
	const logout = async () => {
		await provider.logout();
		manager.resetStatus();
		update();
	};
	return (
		<section className="settings-page__sync-box" aria-label={`${provider.name} sync`}>
			{!provider.isEnabled() ? (
				<div className="settings-page__option settings-page__option--disabled">
					<div className="settings-page__option-text">
						<h3>{provider.name} Sync</h3>
						<p>
							Not configured. A {provider.name === "OneDrive" ? "Microsoft" : "Google"} Client ID is
							required to enable sync.
						</p>
					</div>
				</div>
			) : !connected ? (
				<button
					type="button"
					className="settings-page__option"
					onClick={() => void sync()}
					disabled={busy}
				>
					<div className="settings-page__option-text">
						<h3>Connect {provider.name}</h3>
						<p>Sync songs, setlists and deletions across devices</p>
					</div>
				</button>
			) : (
				<div className="settings-page__option">
					<div className="settings-page__option-text">
						<h3>{provider.name} Connected</h3>
						<p>
							{status.lastSyncTime
								? `Last synced: ${new Date(status.lastSyncTime).toLocaleString()}`
								: "Never synced"}
						</p>
					</div>
					<div className="settings-page__option-actions">
						<button
							type="button"
							className="settings-page__sync-btn"
							disabled={busy}
							onClick={() => void sync()}
						>
							{busy ? "Syncing…" : "Sync Now"}
						</button>
						<button
							type="button"
							className="settings-page__logout-btn"
							disabled={busy}
							onClick={() => void logout()}
						>
							Disconnect
						</button>
					</div>
				</div>
			)}
			{connected && <RevisionCleanup provider={provider} disabled={busy} />}
			{status.error && (
				<p className="settings-page__sync-error" role="alert">
					{status.error}
				</p>
			)}
		</section>
	);
};
export const CloudSync = ({ onStatus }: { onStatus: (status: SyncStatus) => void }) => (
	<section className="settings-page__section">
		<h2>Cloud Sync</h2>
		<div className="settings-page__options">
			{syncHosts.map((host) => (
				<Host key={host.provider.name} host={host} onStatus={onStatus} />
			))}
		</div>
	</section>
);
