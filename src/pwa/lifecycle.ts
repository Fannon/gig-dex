import { useSyncExternalStore } from "react";

interface InstallEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export interface PwaState {
	ready: boolean;
	online: boolean;
	update: boolean;
	updating: boolean;
	blocked: boolean;
	installable: boolean;
	error: string;
}
let state: PwaState = {
	ready: false,
	online: navigator.onLine,
	update: false,
	updating: false,
	blocked: false,
	installable: false,
	error: "",
};
const listeners = new Set<() => void>();
const blockers = new Set<symbol>();
let registration: ServiceWorkerRegistration | undefined;
let installEvent: InstallEvent | undefined;
let started = false;
let reloadPending = false;
const lockName = `gigdex-update:${import.meta.env.BASE_URL}`;
const patch = (value: Partial<PwaState>) => {
	state = { ...state, ...value };
	for (const listener of listeners) listener();
};
export const usePwaState = () =>
	useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		() => state,
	);

// Shared locks prevent one tab activating an update while another is performing/editing.
export function blockPwaUpdate() {
	const token = Symbol();
	blockers.add(token);
	let releaseLock: (() => void) | undefined;
	if (navigator.locks) {
		void navigator.locks
			.request(
				lockName,
				{ mode: "shared" },
				() =>
					new Promise<void>((resolve) => {
						if (!blockers.has(token)) resolve();
						else releaseLock = resolve;
					}),
			)
			.catch(() => {
				/* Current-tab protection still applies. */
			});
	}
	patch({ blocked: true });
	return () => {
		blockers.delete(token);
		releaseLock?.();
		releaseLock = undefined;
		if (!blockers.size) {
			patch({ blocked: false });
			// A controller may have changed in another/older tab. Never reload a busy reader.
			if (reloadPending) patch({ update: true });
		}
	};
}

export function startPwa() {
	if (started) return;
	started = true;
	window.addEventListener("online", () => patch({ online: true }));
	window.addEventListener("offline", () => patch({ online: false }));
	window.addEventListener("beforeinstallprompt", (event) => {
		event.preventDefault();
		installEvent = event as InstallEvent;
		patch({ installable: true });
	});
	window.addEventListener("appinstalled", () => {
		installEvent = undefined;
		patch({ installable: false });
	});
	if (!import.meta.env.PROD) return;
	if (!("serviceWorker" in navigator)) {
		patch({ error: "Offline installation is unavailable. Use a supported browser over HTTPS." });
		return;
	}
	let controlled = !!navigator.serviceWorker.controller;
	navigator.serviceWorker.addEventListener("controllerchange", () => {
		if (controlled) {
			reloadPending = true;
			patch({ update: true });
		}
		controlled = true;
	});
	void navigator.serviceWorker
		.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
		.then(async (value) => {
			registration = value;
			const waiting = () => patch({ update: !!value.waiting || reloadPending });
			waiting();
			const watch = (worker: ServiceWorker | null) => {
				if (!worker) return;
				const change = () => {
					if (worker.state === "installed") {
						waiting();
						worker.removeEventListener("statechange", change);
					}
					if (worker.state === "redundant") {
						worker.removeEventListener("statechange", change);
						patch({ error: "App download failed. Try checking for updates again." });
					}
				};
				worker.addEventListener("statechange", change);
				change();
			};
			value.addEventListener("updatefound", () => watch(value.installing));
			watch(value.installing);
			await navigator.serviceWorker.ready;
			patch({ ready: true });
		})
		.catch(() => patch({ error: "Offline setup failed. Reopen while online and try again." }));
}
export async function checkPwaUpdate() {
	try {
		await registration?.update();
		patch({ error: "" });
	} catch {
		patch({ error: "Could not check for updates. Your downloaded app remains available." });
	}
}
export async function installPwa() {
	const event = installEvent;
	if (!event) return;
	try {
		await event.prompt();
		await event.userChoice;
	} finally {
		installEvent = undefined;
		patch({ installable: false });
	}
}
export async function applyPwaUpdate() {
	if (state.blocked || state.updating) return;
	patch({ updating: true, error: "" });
	const apply = async () => {
		if (state.blocked) return;
		if (reloadPending) {
			window.location.reload();
			return;
		}
		// Re-read the registration: another tab may have activated the advertised update.
		registration =
			(await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)) || registration;
		if (state.blocked) return;
		if (reloadPending) {
			window.location.reload();
			return;
		}
		const worker = registration?.waiting;
		if (!worker) {
			patch({
				update: false,
				error: "No pending update was found. Check for updates in Settings.",
			});
			return;
		}
		await new Promise<void>((resolve, reject) => {
			const container = navigator.serviceWorker;
			const cleanup = () => {
				window.clearTimeout(timeout);
				container.removeEventListener("controllerchange", controlled);
				worker.removeEventListener("statechange", changed);
			};
			const controlled = () => {
				// Activation alone does not guarantee the next navigation uses the new app.
				if (container.controller !== worker) return;
				cleanup();
				reloadPending = true;
				if (!state.blocked) window.location.reload();
				else patch({ update: true });
				resolve();
			};
			const changed = () => {
				if (worker.state !== "redundant") return;
				cleanup();
				reject(new Error("Update failed"));
			};
			const timeout = window.setTimeout(() => {
				cleanup();
				reject(new Error("Update activation timed out"));
			}, 15000);
			container.addEventListener("controllerchange", controlled);
			worker.addEventListener("statechange", changed);
			worker.postMessage({ type: "SKIP_WAITING" });
			controlled();
		});
	};
	try {
		if (navigator.locks)
			await navigator.locks.request(lockName, { ifAvailable: true }, async (lock) => {
				if (lock) await apply();
				else
					patch({
						error: "Close performance mode or save edits in other Gig-Dex tabs before updating.",
					});
			});
		else if (window.confirm("Close other Gig-Dex tabs before updating. Restart now?"))
			await apply();
	} catch {
		patch({ error: "The update did not finish. Check your connection and try again." });
	} finally {
		patch({ updating: false });
	}
}

async function repairCache() {
	if (state.blocked || !state.online)
		throw new Error("Go online and save your work before repairing the app.");
	// Confirm the app host is reachable before removing any downloaded assets.
	const response = await fetch(`${import.meta.env.BASE_URL}?gigdex-repair=${Date.now()}`, {
		cache: "no-store",
		signal: AbortSignal.timeout(10000),
	});
	if (!response.ok || !response.headers.get("content-type")?.includes("text/html"))
		throw new Error("The app host is unavailable. Nothing was removed.");
	const scope = new URL(import.meta.env.BASE_URL, location.origin).href;
	const registrations = await navigator.serviceWorker.getRegistrations();
	for (const item of registrations) if (item.scope === scope) await item.unregister();
	for (const name of await caches.keys()) {
		if (name.startsWith("workbox-precache-") && name.endsWith(scope)) await caches.delete(name);
	}
	// IndexedDB, localStorage, and cloud files are deliberately untouched.
	location.assign(import.meta.env.BASE_URL);
}

export async function repairPwaCache() {
	if (!navigator.locks) {
		await repairCache();
		return;
	}
	await navigator.locks.request(lockName, { ifAvailable: true }, async (lock) => {
		if (!lock)
			throw new Error(
				"Close performance mode or save edits in other Gig-Dex tabs before repairing.",
			);
		await repairCache();
	});
}
