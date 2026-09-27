import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
	vi.resetModules();
	Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

it("keeps updates blocked until all editors/readers release, including late lock acquisition", async () => {
	const callbacks: (() => Promise<void>)[] = [];
	Object.defineProperty(navigator, "locks", {
		configurable: true,
		value: {
			request: vi.fn((_name, _options, callback) => {
				callbacks.push(callback);
				return Promise.resolve();
			}),
		},
	});
	const pwa = await import("./lifecycle");
	const { result } = renderHook(pwa.usePwaState);
	let first = () => {};
	let second = () => {};
	act(() => {
		first = pwa.blockPwaUpdate();
		second = pwa.blockPwaUpdate();
	});
	expect(result.current.blocked).toBe(true);
	act(first);
	expect(result.current.blocked).toBe(true);
	await callbacks[0](); // StrictMode/unmount before acquisition must not leak a shared lock.
	const held = callbacks[1]();
	act(second);
	await held;
	expect(result.current.blocked).toBe(false);
});

it("refuses repair when the network fails, without touching caches or registrations", async () => {
	Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
	const fetch = vi.fn().mockRejectedValue(new Error("network failed"));
	vi.stubGlobal("fetch", fetch);
	const unregister = vi.fn();
	Object.defineProperty(navigator, "serviceWorker", {
		configurable: true,
		value: { getRegistrations: unregister },
	});
	const remove = vi.fn();
	vi.stubGlobal("caches", { delete: remove });
	const { repairPwaCache } = await import("./lifecycle");
	await expect(repairPwaCache()).rejects.toThrow("network failed");
	expect(unregister).not.toHaveBeenCalled();
	expect(remove).not.toHaveBeenCalled();
	expect(fetch.mock.calls[0][0]).toContain("gigdex-repair=");
});

it("rejects repair while a song editor or performance view is open", async () => {
	const pwa = await import("./lifecycle");
	const release = pwa.blockPwaUpdate();
	await expect(pwa.repairPwaCache()).rejects.toThrow("save your work");
	release();
});

it("does not activate a waiting update while busy locally or in another tab", async () => {
	vi.stubEnv("PROD", true);
	const worker = Object.assign(new EventTarget(), { postMessage: vi.fn() });
	const registration = Object.assign(new EventTarget(), { waiting: worker, update: vi.fn() });
	Object.defineProperty(navigator, "serviceWorker", {
		configurable: true,
		value: Object.assign(new EventTarget(), {
			register: vi.fn().mockResolvedValue(registration),
			ready: Promise.resolve(registration),
			controller: {},
		}),
	});
	Object.defineProperty(navigator, "locks", {
		configurable: true,
		value: {
			request: vi.fn(async (_name, options, callback) =>
				options.ifAvailable ? callback(null) : new Promise(() => {}),
			),
		},
	});
	const pwa = await import("./lifecycle");
	const { result } = renderHook(pwa.usePwaState);
	act(pwa.startPwa);
	await waitFor(() => expect(result.current.update).toBe(true));
	let release = () => {};
	act(() => {
		release = pwa.blockPwaUpdate();
	});
	await act(pwa.applyPwaUpdate);
	expect(worker.postMessage).not.toHaveBeenCalled();
	act(release);
	await act(pwa.applyPwaUpdate);
	expect(worker.postMessage).not.toHaveBeenCalled();
	expect(result.current.error).toContain("other Gig-Dex tabs");
});
