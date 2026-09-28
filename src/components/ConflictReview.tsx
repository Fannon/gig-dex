import { useEffect, useMemo, useState } from "react";
import { isDeletion, type LibraryRecord, recordTitle, type SyncConflict } from "../sync/records";
import { getSyncConflicts, resolveConflict } from "../sync/syncStore";
import type { SyncStatus } from "../sync/types";
import { changedFields, lineDifference } from "../utils/conflictComparison";
import "./ConflictReview.scss";

const Version = ({ record, label }: { record?: LibraryRecord; label: string }) => (
  <details>
    <summary>
      {label}:{" "}
      {record ? (isDeletion(record) ? `Deleted — ${record.title}` : recordTitle(record)) : "Not on this device"}
    </summary>
    {record && (
      <>
        <p>Modified {new Date(record.lastModified).toLocaleString()}</p>
        <pre>
          {isDeletion(record)
            ? "Deletion requested."
            : "content" in record
              ? record.content
              : JSON.stringify(
                  {
                    name: record.name,
                    description: record.description,
                    tags: record.tags,
                    songIds: record.songIds,
                  },
                  null,
                  2,
                )}
        </pre>
      </>
    )}
  </details>
);
const Comparison = ({ local, remote, index }: { local?: LibraryRecord; remote: LibraryRecord; index: number }) => {
  const fields = useMemo(() => changedFields(local, remote), [local, remote]);
  const lines = useMemo(
    () => lineDifference(local && "content" in local ? local.content : "", "content" in remote ? remote.content : ""),
    [local, remote],
  );
  const contentChanged = lines.some((line) => line.kind !== "same");
  const display = (value: unknown) =>
    value === undefined ? "—" : typeof value === "string" ? value : JSON.stringify(value);
  return (
    <details className="conflict-review__comparison">
      <summary>
        Compare with remote version {index + 1} · {fields.length} changed fields
        {contentChanged ? " + song text" : ""}
      </summary>
      {(isDeletion(remote) || (local && isDeletion(local))) && (
        <p>
          Deletion versus editing: choosing a deletion removes the original item; keep copies to preserve the edited
          version.
        </p>
      )}
      {fields.length > 0 && (
        <div className="conflict-review__table">
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>This device</th>
                <th>Remote version</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <tr key={field.key}>
                  <th>{field.key}</th>
                  <td>{display(field.local)}</td>
                  <td>{display(field.remote)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {contentChanged && (
        <>
          <p>− removed from this device’s text · + added in remote text</p>
          <pre className="conflict-review__diff">
            {lines.map((line, index) => (
              <span key={`${index}:${line.kind}`} className={`diff-${line.kind}`}>
                {line.kind === "added" ? "+ " : line.kind === "removed" ? "− " : "  "}
                {line.text}
                {"\n"}
              </span>
            ))}
          </pre>
        </>
      )}
      {!fields.length && !contentChanged && <p>Content is identical. Only timestamps or revision history differ.</p>}
    </details>
  );
};
export const ConflictReview = ({ status }: { status: SyncStatus }) => {
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Reload durable conflicts whenever a sync operation changes status.
  useEffect(() => {
    let disposed = false;
    getSyncConflicts()
      .then((items) => {
        if (!disposed) setConflicts(items);
      })
      .catch(() => {
        if (!disposed) setError("Could not load sync conflicts.");
      });
    return () => {
      disposed = true;
    };
  }, [status]);
  const resolve = async (id: string, choice: "local" | "both" | number) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await resolveConflict(id, choice);
      setConflicts(await getSyncConflicts());
      window.dispatchEvent(new Event("gigdex-sync-status"));
      setMessage("Resolution saved. Sync again to share it with your other devices.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not resolve conflict.");
    } finally {
      setBusy(false);
    }
  };
  if (!conflicts.length && !message && !error) return null;
  return (
    <section className="settings-page__section conflict-review">
      <h2>Sync conflicts</h2>
      <p>
        {conflicts.length} item{conflicts.length === 1 ? "" : "s"} need review. Both versions are safe until you choose.
        Open details to compare changes.
      </p>
      {conflicts.map((conflict) => (
        <article key={conflict.id}>
          <h3>{conflict.local ? recordTitle(conflict.local) : recordTitle(conflict.remote[0].record)}</h3>
          <p>
            {conflict.type === "song" ? "Song" : "Setlist"} · Edited in more than one place ·{" "}
            {conflict.remote.length + (conflict.local ? 1 : 0)} versions
          </p>
          {conflict.provider && <p>Host: {conflict.provider}</p>}
          {conflict.remote.map((version, index) => (
            <Comparison
              key={`compare:${version.revision}`}
              local={conflict.local}
              remote={version.record}
              index={index}
            />
          ))}
          <Version record={conflict.local} label="This device" />
          {conflict.remote.map((version, index) => (
            <Version key={version.revision} record={version.record} label={`Remote version ${index + 1}`} />
          ))}
          <div className="conflict-review__actions">
            <button type="button" disabled={busy || !conflict.local} onClick={() => void resolve(conflict.id, "local")}>
              Keep my version
            </button>
            {conflict.remote.map((version, index) => (
              <button
                type="button"
                key={version.revision}
                disabled={busy}
                onClick={() => void resolve(conflict.id, index)}
              >
                {isDeletion(version.record)
                  ? `Use the other deletion ${index + 1}`
                  : `Use the other version ${index + 1}`}
              </button>
            ))}
            {conflict.remote.some((version) => !isDeletion(version.record)) && (
              <button type="button" disabled={busy} onClick={() => void resolve(conflict.id, "both")}>
                Keep both
              </button>
            )}
          </div>
        </article>
      ))}
      {message && <output>{message}</output>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
};
