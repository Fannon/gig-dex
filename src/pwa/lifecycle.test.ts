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

async function updateFixture(waiting = true) {
	vi.stubEnv("PROD", true);
	const worker = Object.assign(new EventTarget(), {
		state: "installed",
		postMessage: vi.fn(),
	});
	const registration = Object.assign(new EventTarget(), {
		waiting: waiting ? worker : null,
		update: vi.fn(),
	});
	const container = Object.assign(new EventTarget(), {
		register: vi.fn().mockResolvedValue(registration),
		getRegistration: vi.fn().mockResolvedValue(registration),
		ready: Promise.resolve(registration),
		controller: new EventTarget(),
	});
	Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: container });
	Object.defineProperty(navigator, "locks", {
		configurable: true,
		value: { request: vi.fn(async (_name, _options, callback) => callback({})) },
	});
	const reload = vi.fn();
	vi.stubGlobal(
		"window",
		new Proxy(window, {
			get: (target, key) => (key === "location" ? { reload } : Reflect.get(target, key)),
		}),
	);
	const pwa = await import("./lifecycle");
	const { result } = renderHook(pwa.usePwaState);
	act(pwa.startPwa);
	await waitFor(() => expect(result.current.ready).toBe(true));
	return { pwa, result, worker, registration, container, reload };
}

it("restarts only after the new worker controls the page and ignores duplicate update clicks", async () => {
	const { pwa, result, worker, container, reload } = await updateFixture();
	let pending: Promise<void>;
	await act(async () => {
		pending = pwa.applyPwaUpdate();
		await Promise.resolve();
	});
	expect(result.current.updating).toBe(true);
	expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
	await act(pwa.applyPwaUpdate);
	expect(worker.postMessage).toHaveBeenCalledTimes(1);
	act(() => {
		worker.state = "activated";
		worker.dispatchEvent(new Event("statechange"));
		container.dispatchEvent(new Event("controllerchange"));
	});
	expect(reload).not.toHaveBeenCalled();
	await act(async () => {
		container.controller = worker;
		container.dispatchEvent(new Event("controllerchange"));
		await pending;
	});
	expect(reload).toHaveBeenCalledTimes(1);
	expect(result.current.updating).toBe(false);
});

it("reports a disappeared waiting worker instead of leaving an inert update button", async () => {
	const { pwa, result, registration, reload } = await updateFixture();
	registration.waiting = null;
	await act(pwa.applyPwaUpdate);
	expect(result.current.update).toBe(false);
	expect(result.current.updating).toBe(false);
	expect(result.current.error).toContain("No pending update");
	expect(reload).not.toHaveBeenCalled();
});

it("shows a retryable failure when activation times out and releases the update lock", async () => {
	const { pwa, result, reload } = await updateFixture();
	const setTimeout = window.setTimeout.bind(window);
	vi.spyOn(window, "setTimeout").mockImplementation(
		(callback, delay, ...args) =>
			setTimeout(callback, delay === 15000 ? 0 : delay, ...args) as unknown as ReturnType<
				typeof window.setTimeout
			>,
	);
	await act(pwa.applyPwaUpdate);
	expect(result.current.updating).toBe(false);
	expect(result.current.error).toContain("did not finish");
	expect(reload).not.toHaveBeenCalled();
});

it("does not activate when editing starts while refreshing the registration", async () => {
	const { pwa, result, registration, worker, container } = await updateFixture();
	let refreshed = (_value: typeof registration) => {};
	container.getRegistration.mockImplementation(
		() =>
			new Promise((resolve) => {
				refreshed = resolve;
			}),
	);
	let pending: Promise<void>;
	let release = () => {};
	await act(async () => {
		pending = pwa.applyPwaUpdate();
		await Promise.resolve();
		release = pwa.blockPwaUpdate();
		refreshed(registration);
		await pending;
	});
	expect(worker.postMessage).not.toHaveBeenCalled();
	expect(result.current.updating).toBe(false);
	act(release);
});
