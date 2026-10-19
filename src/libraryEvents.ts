export const LIBRARY_CHANGED_EVENT = "gig-dex-library-changed";
export const LIBRARY_MUTATED_EVENT = "gig-dex-library-mutated";

// Match the shared IndexedDB database, including tabs using different app paths.
const CHANNEL_NAME = "gigdex-library:GigDexDB";
let channel: BroadcastChannel | undefined;

const refreshLibrary = () => window.dispatchEvent(new Event(LIBRARY_CHANGED_EVENT));

export function notifyLibraryChanged() {
  if (typeof window === "undefined") return;
  refreshLibrary();
  try {
    // Send only an invalidation: each tab reads committed data from IndexedDB.
    channel?.postMessage("changed");
  } catch {
    // A notification failure must not turn a committed save into a failed save.
  }
}

export function notifyLibraryMutated() {
  notifyLibraryChanged();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LIBRARY_MUTATED_EVENT));
}

/** Refresh other open tabs without rebroadcasting or scheduling another sync. */
export function startLibraryEvents(): () => void {
  if (channel || typeof window.BroadcastChannel !== "function") return () => {};
  let connection: BroadcastChannel;
  try {
    connection = new window.BroadcastChannel(CHANNEL_NAME);
  } catch {
    // Existing focus refreshes remain available when cross-tab messaging is unavailable.
    return () => {};
  }
  channel = connection;
  connection.onmessage = ({ data }) => {
    if (data === "changed") refreshLibrary();
  };
  return () => {
    connection.onmessage = null;
    connection.close();
    if (channel === connection) channel = undefined;
  };
}
