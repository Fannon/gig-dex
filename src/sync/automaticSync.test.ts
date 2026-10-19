import { afterEach, expect, it, vi } from "vitest";
import { LIBRARY_CHANGED_EVENT, LIBRARY_MUTATED_EVENT } from "../db";
import { startAutomaticSync } from "./automaticSync";
import type { syncHosts } from "./index";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("pulls remote changes once on open for an existing silent connection", async () => {
  vi.useFakeTimers();
  const localSync = vi.fn(async () => {});
  const googleSync = vi.fn(async () => {});
  const hosts = [
    {
      provider: { name: "Local Folder", ready: Promise.resolve(), isEnabled: () => true, isAuthenticated: () => true },
      manager: { sync: localSync, getStatus: () => ({ error: null }) },
    },
    {
      provider: { name: "Google Drive", isEnabled: () => true, isAuthenticated: () => true },
      manager: { sync: googleSync, getStatus: () => ({ error: null }) },
    },
  ] as unknown as typeof syncHosts;
  const stop = startAutomaticSync(hosts, () => false);
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(localSync).toHaveBeenCalledTimes(1);
    expect(googleSync).not.toHaveBeenCalled();
    window.dispatchEvent(new Event(LIBRARY_CHANGED_EVENT));
    await vi.advanceTimersByTimeAsync(1000);
    expect(localSync).toHaveBeenCalledTimes(1);
  } finally {
    stop();
  }
});

it("waits for network access before pulling a connected cloud provider on open", async () => {
  vi.useFakeTimers();
  let online = false;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  const sync = vi.fn(async () => {});
  const host = {
    provider: { name: "Dropbox", isEnabled: () => true, isAuthenticated: () => true },
    manager: { sync, getStatus: () => ({ error: null }) },
  } as unknown as (typeof syncHosts)[number];
  const stop = startAutomaticSync([host], () => false);
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(sync).not.toHaveBeenCalled();
    online = true;
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(sync).toHaveBeenCalledTimes(1);
  } finally {
    stop();
  }
});

it("syncs connected providers once for a burst of local edits and ignores read-only refreshes", async () => {
  vi.useFakeTimers();
  const sync = vi.fn(async () => {});
  const host = {
    provider: { name: "Local Folder", ready: Promise.resolve(), isEnabled: () => true, isAuthenticated: () => true },
    manager: { sync, getStatus: () => ({ error: null }) },
  } as unknown as (typeof syncHosts)[number];
  const stop = startAutomaticSync([host], () => false);
  try {
    window.dispatchEvent(new Event(LIBRARY_CHANGED_EVENT));
    window.dispatchEvent(new Event(LIBRARY_MUTATED_EVENT));
    window.dispatchEvent(new Event(LIBRARY_MUTATED_EVENT));
    await vi.advanceTimersByTimeAsync(900);
    expect(sync).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event(LIBRARY_CHANGED_EVENT));
    await vi.advanceTimersByTimeAsync(2000);
    expect(sync).toHaveBeenCalledTimes(1);
  } finally {
    stop();
  }
});

it("waits for an active manual sync and never opens a disconnected provider", async () => {
  vi.useFakeTimers();
  let busy = true;
  let connected = true;
  const sync = vi.fn(async () => {});
  const host = {
    provider: { name: "Dropbox", isEnabled: () => true, isAuthenticated: () => connected },
    manager: { sync, getStatus: () => ({ error: null }) },
  } as unknown as (typeof syncHosts)[number];
  const stop = startAutomaticSync([host], () => busy);
  try {
    window.dispatchEvent(new Event(LIBRARY_MUTATED_EVENT));
    await vi.advanceTimersByTimeAsync(900);
    expect(sync).not.toHaveBeenCalled();
    busy = false;
    connected = false;
    await vi.advanceTimersByTimeAsync(1500);
    expect(sync).not.toHaveBeenCalled();
    connected = true;
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(sync).toHaveBeenCalledTimes(1);
  } finally {
    stop();
  }
});

it.each(["focus", "online", LIBRARY_MUTATED_EVENT])(
  "retries a failed connected sync on %s without a background retry loop",
  async (event) => {
    vi.useFakeTimers();
    let error: string | null = null;
    const sync = vi.fn(async () => {
      error = sync.mock.calls.length === 1 ? "Temporary network failure" : null;
    });
    const host = {
      provider: { name: "Dropbox", isEnabled: () => true, isAuthenticated: () => true },
      manager: { sync, getStatus: () => ({ error }) },
    } as unknown as (typeof syncHosts)[number];
    const stop = startAutomaticSync([host], () => false);
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(error).toBe("Temporary network failure");
      await vi.advanceTimersByTimeAsync(60000);
      expect(sync).toHaveBeenCalledTimes(1);
      window.dispatchEvent(new Event(event));
      await vi.advanceTimersByTimeAsync(900);
      expect(sync).toHaveBeenCalledTimes(2);
      expect(error).toBeNull();
    } finally {
      stop();
    }
  },
);

it("does not start syncing if stopped while a provider is becoming ready", async () => {
  vi.useFakeTimers();
  let ready: () => void = () => {};
  const sync = vi.fn(async () => {});
  const host = {
    provider: {
      name: "Local Folder",
      isEnabled: () => true,
      isAuthenticated: () => true,
      ready: new Promise<void>((resolve) => {
        ready = resolve;
      }),
    },
    manager: { sync, getStatus: () => ({ error: null }) },
  } as unknown as (typeof syncHosts)[number];
  const stop = startAutomaticSync([host], () => false);
  await vi.advanceTimersByTimeAsync(0);
  stop();
  ready();
  await vi.advanceTimersByTimeAsync(10000);
  expect(sync).not.toHaveBeenCalled();
});
