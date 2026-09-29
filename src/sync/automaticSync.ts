import { LIBRARY_MUTATED_EVENT } from "../db";
import { syncHosts } from "./index";
import { SyncManager } from "./syncManager";

const AUTO_SYNC_DELAY_MS = 900;

/** Sync completed local edits while the app is open and a silent connection is available. */
export function startAutomaticSync(
  hosts: typeof syncHosts = syncHosts,
  busy: () => boolean = SyncManager.isBusy,
): () => void {
  let pending = false;
  let running = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (delay = AUTO_SYNC_DELAY_MS) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), delay);
  };
  const flush = async () => {
    timer = undefined;
    if (!pending || running || stopped) return;
    await Promise.all(hosts.map(({ provider }) => provider.ready));
    if (busy()) {
      schedule(1500);
      return;
    }
    // Google Drive's current OAuth flow can open a popup when its token expires.
    const connected = hosts.filter(
      ({ provider, manager }) =>
        provider.name !== "Google Drive" &&
        provider.isEnabled() &&
        provider.isAuthenticated?.() &&
        !manager.getStatus().error,
    );
    if (!connected.length) return;
    pending = false;
    running = true;
    try {
      for (const { manager } of connected) {
        if (busy()) {
          pending = true;
          break;
        }
        await manager.sync();
      }
    } finally {
      running = false;
      if (pending && !stopped) schedule();
    }
  };
  const changed = () => {
    pending = true;
    schedule();
  };
  const retry = () => {
    if (pending) schedule(0);
  };
  window.addEventListener(LIBRARY_MUTATED_EVENT, changed);
  window.addEventListener("focus", retry);
  window.addEventListener("online", retry);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    window.removeEventListener(LIBRARY_MUTATED_EVENT, changed);
    window.removeEventListener("focus", retry);
    window.removeEventListener("online", retry);
  };
}
