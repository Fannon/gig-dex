import { useEffect, useState } from "react";
import { readSyncActivity, SYNC_ACTIVITY_EVENT, type SyncChangeCounts } from "../sync/activity";

function hasChanges(counts: SyncChangeCounts): boolean {
  return counts.added + counts.updated + counts.removed > 0;
}

function describeChanges(counts: SyncChangeCounts): string {
  return `${counts.added} added · ${counts.updated} updated · ${counts.removed} removed`;
}

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
        <>
          {ownEntries.some((entry) => entry.stats) && <p>Counts include songs and setlists.</p>}
          <ul>
            {ownEntries.map((entry, index) => (
              <li key={`${entry.time}:${entry.provider}:${index}`} data-kind={entry.kind}>
                <time dateTime={entry.time}>{new Date(entry.time).toLocaleString()}</time>
                <span>{entry.message}</span>
                {entry.stats && (
                  <div className="settings-page__activity-stats">
                    {hasChanges(entry.stats.received) && <div>Received: {describeChanges(entry.stats.received)}</div>}
                    {hasChanges(entry.stats.sent) && <div>Sent: {describeChanges(entry.stats.sent)}</div>}
                    {!hasChanges(entry.stats.received) && !hasChanges(entry.stats.sent) && entry.kind === "success" && (
                      <div>No changes sent or received.</div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>Your sync activity will appear here.</p>
      )}
    </section>
  );
}
