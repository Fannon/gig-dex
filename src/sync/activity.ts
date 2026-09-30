export interface SyncChangeCounts {
  added: number;
  updated: number;
  removed: number;
}

export interface SyncActivityStats {
  sent: SyncChangeCounts;
  received: SyncChangeCounts;
}

export interface SyncActivity {
  provider: string;
  time: string;
  kind: "success" | "error" | "conflict";
  message: string;
  stats?: SyncActivityStats;
}

const key = "gigdex-sync-activity";
export const SYNC_ACTIVITY_EVENT = "gigdex-sync-activity";

function validCounts(value: unknown): value is SyncChangeCounts {
  if (!value || typeof value !== "object") return false;
  return ["added", "updated", "removed"].every((key) => {
    const count = (value as Record<string, unknown>)[key];
    return typeof count === "number" && Number.isSafeInteger(count) && count >= 0;
  });
}

function validStats(value: unknown): value is SyncActivityStats {
  return (
    !!value &&
    typeof value === "object" &&
    validCounts((value as SyncActivityStats).sent) &&
    validCounts((value as SyncActivityStats).received)
  );
}

export function readSyncActivity(): SyncActivity[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? value
          .filter(
            (item): item is SyncActivity =>
              !!item &&
              typeof item === "object" &&
              typeof item.provider === "string" &&
              typeof item.time === "string" &&
              typeof item.message === "string" &&
              ["success", "error", "conflict"].includes(item.kind),
          )
          .map((item) => ({ ...item, stats: validStats(item.stats) ? item.stats : undefined }))
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
