import { useEffect, useState } from "react";
import { isDeletion, type LibraryRecord, recordTitle, type SyncConflict } from "../sync/records";
import { getSyncConflicts, resolveConflict } from "../sync/syncStore";
import type { SyncStatus } from "../sync/types";
import "./ConflictReview.scss";

const Version = ({ record, label }: { record?: LibraryRecord; label: string }) => (
	<details>
		<summary>
			{label}:{" "}
			{record
				? isDeletion(record)
					? `Deleted — ${record.title}`
					: recordTitle(record)
				: "Not on this device"}
		</summary>
		{record && (
			<>
				<p>Modified {new Date(record.lastModified).toLocaleString()}</p>
				<pre>
					{isDeletion(record)
						? "Deletion requested."
						: "content" in record
							? record.content
							: JSON.stringify(
									{
										name: record.name,
										description: record.description,
										tags: record.tags,
										songIds: record.songIds,
									},
									null,
									2,
								)}
				</pre>
			</>
		)}
	</details>
);
export const ConflictReview = ({ status }: { status: SyncStatus }) => {
	const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: Reload durable conflicts whenever a sync operation changes status.
	useEffect(() => {
		let disposed = false;
		getSyncConflicts()
			.then((items) => {
				if (!disposed) setConflicts(items);
			})
			.catch(() => {
				if (!disposed) setError("Could not load sync conflicts.");
			});
		return () => {
			disposed = true;
		};
	}, [status]);
	const resolve = async (id: string, choice: "local" | "both" | number) => {
		setBusy(true);
		setError("");
		setMessage("");
		try {
			await resolveConflict(id, choice);
			setConflicts(await getSyncConflicts());
			setMessage("Resolution saved. Sync again to share it with your other devices.");
		} catch (error) {
			setError(error instanceof Error ? error.message : "Could not resolve conflict.");
		} finally {
			setBusy(false);
		}
	};
	if (!conflicts.length && !message && !error) return null;
	return (
		<section className="settings-page__section conflict-review">
			<h2>Sync conflicts</h2>
			<p>
				Both versions are preserved. Review them before choosing; timestamps do not decide which
				edit wins.
			</p>
			{conflicts.map((conflict) => (
				<article key={conflict.id}>
					<h3>
						{conflict.local ? recordTitle(conflict.local) : recordTitle(conflict.remote[0].record)}
					</h3>
					<Version record={conflict.local} label="This device" />
					{conflict.remote.map((version, index) => (
						<Version
							key={version.revision}
							record={version.record}
							label={`Remote version ${index + 1}`}
						/>
					))}
					<div className="conflict-review__actions">
						<button
							type="button"
							disabled={busy || !conflict.local}
							onClick={() => void resolve(conflict.id, "local")}
						>
							Keep this device’s version
						</button>
						{conflict.remote.map((version, index) => (
							<button
								type="button"
								key={version.revision}
								disabled={busy}
								onClick={() => void resolve(conflict.id, index)}
							>
								{isDeletion(version.record)
									? `Use remote deletion ${index + 1}`
									: `Use remote version ${index + 1}`}
							</button>
						))}
						{conflict.remote.some((version) => !isDeletion(version.record)) && (
							<button
								type="button"
								disabled={busy}
								onClick={() => void resolve(conflict.id, "both")}
							>
								Keep both as separate copies
							</button>
						)}
					</div>
				</article>
			))}
			{message && <output>{message}</output>}
			{error && <p role="alert">{error}</p>}
		</section>
	);
};
