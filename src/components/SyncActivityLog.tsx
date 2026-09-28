import { useEffect, useState } from "react";
import { readSyncActivity, SYNC_ACTIVITY_EVENT } from "../sync/activity";

export function SyncActivityLog() {
  const [entries, setEntries] = useState(readSyncActivity);
  useEffect(() => {
    const refresh = () => setEntries(readSyncActivity());
    window.addEventListener(SYNC_ACTIVITY_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SYNC_ACTIVITY_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return (
    <section className="settings-page__activity" aria-label="Recent sync activity">
      <h3>Recent activity</h3>
      {entries.length ? (
        <ul>
          {entries.map((entry, index) => (
            <li key={`${entry.time}:${entry.provider}:${index}`} data-kind={entry.kind}>
              <time dateTime={entry.time}>{new Date(entry.time).toLocaleString()}</time>
              <span>
                {entry.provider}: {entry.message}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>Your sync activity will appear here.</p>
      )}
    </section>
  );
}
