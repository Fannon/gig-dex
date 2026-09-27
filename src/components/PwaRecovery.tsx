import { useState } from "react";
import { Link } from "react-router-dom";
import { repairPwaCache, usePwaState } from "../pwa/lifecycle";

export function PwaRecovery() {
	const state = usePwaState();
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	return (
		<main className="pwa-recovery">
			<h1>This view couldn’t load</h1>
			<p>
				Your library is stored separately from downloaded app files. Try reopening this view when
				connected.
			</p>
			<Link to="/">Go to your library</Link>
			<button type="button" onClick={() => location.reload()}>
				Retry loading
			</button>
			{typeof navigator.serviceWorker?.getRegistrations === "function" && (
				<button
					type="button"
					disabled={busy || !state.online || state.blocked}
					onClick={() => {
						if (
							!window.confirm(
								"Repair downloaded app files and restart? Your local library will be preserved. Close other Gig-Dex tabs first.",
							)
						)
							return;
						setBusy(true);
						void repairPwaCache().catch((error: unknown) => {
							setMessage(
								error instanceof Error ? error.message : "Repair failed. Try again when connected.",
							);
							setBusy(false);
						});
					}}
				>
					Repair app files
				</button>
			)}
			{message && <p role="alert">{message}</p>}
		</main>
	);
}
