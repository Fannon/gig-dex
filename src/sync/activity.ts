export interface SyncActivity {
  provider: string;
  time: string;
  kind: "success" | "error" | "conflict";
  message: string;
}

const key = "gigdex-sync-activity";
export const SYNC_ACTIVITY_EVENT = "gigdex-sync-activity";

export function readSyncActivity(): SyncActivity[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? value.filter(
          (item): item is SyncActivity =>
            !!item &&
            typeof item === "object" &&
            typeof item.provider === "string" &&
            typeof item.time === "string" &&
            typeof item.message === "string" &&
            ["success", "error", "conflict"].includes(item.kind),
        )
      : [];
  } catch {
    return [];
  }
}

export function addSyncActivity(entry: SyncActivity): void {
  try {
    localStorage.setItem(key, JSON.stringify([entry, ...readSyncActivity()].slice(0, 50)));
  } catch {
    // Sync still works when browser storage is full or unavailable.
  }
  window.dispatchEvent(new Event(SYNC_ACTIVITY_EVENT));
}
