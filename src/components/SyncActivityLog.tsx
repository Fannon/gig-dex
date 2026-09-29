import { useEffect, useState } from "react";
import { readSyncActivity, SYNC_ACTIVITY_EVENT } from "../sync/activity";

export function SyncActivityLog({ provider }: { provider: string }) {
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
  const ownEntries = entries.filter((entry) => entry.provider === provider);
  return (
    <section className="settings-page__activity" aria-label={`${provider} sync activity`}>
      {ownEntries.length ? (
        <ul>
          {ownEntries.map((entry, index) => (
            <li key={`${entry.time}:${entry.provider}:${index}`} data-kind={entry.kind}>
              <time dateTime={entry.time}>{new Date(entry.time).toLocaleString()}</time>
              <span>{entry.message}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>Your sync activity will appear here.</p>
      )}
    </section>
  );
}
