import { afterEach, expect, it, vi } from "vitest";
import { SyncManager } from "./syncManager";
import type { SyncProvider } from "./types";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("waits before contacting the provider and keeps the app busy until the shared operation finishes", async () => {
  let grant = () => {};
  const available = new Promise<void>((resolve) => {
    grant = resolve;
  });
  const request = vi.fn(async (name, options, callback) => {
    if (name === "gigdex-sync:GigDexDB") {
      expect(options.ifAvailable).toBe(false);
      await available;
    }
    return callback({ name });
  });
  vi.stubGlobal("navigator", { onLine: true, locks: { request } });
  const authenticate = vi.fn(async () => false);
  const manager = new SyncManager({ name: "Test", authenticate } as unknown as SyncProvider);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const sync = manager.sync();
  expect(manager.getStatus()).toMatchObject({ isSyncing: true, waitingForTab: true });
  expect(SyncManager.isBusy()).toBe(true);
  expect(authenticate).not.toHaveBeenCalled();
  await expect(SyncManager.exclusive(async () => {})).rejects.toThrow("Another sync");
  grant();
  await sync;
  expect(authenticate).toHaveBeenCalledTimes(1);
  expect(manager.getStatus()).toMatchObject({
    isSyncing: false,
    waitingForTab: false,
    error: "Could not connect to Test. Try again.",
  });
  expect(SyncManager.isBusy()).toBe(false);
});

it("rejects cleanup or connection changes held by another tab before running them, then permits retry", async () => {
  let occupied = true;
  const request = vi.fn(async (name, options, callback) => {
    if (name === "gigdex-sync:GigDexDB") {
      expect(options.ifAvailable).toBe(true);
      return callback(occupied ? null : { name });
    }
    return callback({ name });
  });
  vi.stubGlobal("navigator", { onLine: true, locks: { request } });
  const operation = vi.fn(async () => "done");
  await expect(SyncManager.exclusive(operation)).rejects.toThrow("Another Gig-Dex tab");
  expect(operation).not.toHaveBeenCalled();
  expect(SyncManager.isBusy()).toBe(false);
  occupied = false;
  expect(await SyncManager.exclusive(operation)).toBe("done");
  expect(operation).toHaveBeenCalledTimes(1);
  expect(SyncManager.isBusy()).toBe(false);
});

it("releases local protection after a browser lock failure", async () => {
  vi.stubGlobal("navigator", {
    onLine: true,
    locks: {
      request: vi.fn(async () => {
        throw new Error("Lock denied");
      }),
    },
  });
  const operation = vi.fn(async () => {});
  await expect(SyncManager.exclusive(operation)).rejects.toThrow("Lock denied");
  expect(operation).not.toHaveBeenCalled();
  expect(SyncManager.isBusy()).toBe(false);
});
