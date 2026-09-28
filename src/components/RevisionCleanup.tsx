import { useState } from "react";
import { applyRevisionCleanup, type CleanupPlan, previewRevisionCleanup } from "../sync/revisionCleanup";
import type { SyncProvider } from "../sync/types";

export const RevisionCleanup = ({ provider, disabled }: { provider: SyncProvider; disabled: boolean }) => {
  const [plan, setPlan] = useState<CleanupPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const preview = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    setPlan(null);
    try {
      setPlan(await previewRevisionCleanup(provider));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not review history.");
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    if (
      !plan ||
      !confirm(
        `Move ${plan.candidates.length} reviewed ${provider.name} revisions to trash? Current songs, deletion markers and retained history stay available.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const count = await applyRevisionCleanup(provider, plan);
      setMessage(`${count} old revisions moved to trash.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Cleanup failed.");
    } finally {
      setBusy(false);
      setPlan(null);
    }
  };
  return (
    <div className="revision-cleanup">
      <button type="button" disabled={disabled || busy} onClick={() => void preview()}>
        Review {provider.name} history cleanup
      </button>
      <p>
        Keeps current versions, competing branches, 30 days of uploads and five older revisions per item. Local deletion
        markers are retained. Retired files go to the host’s trash.
      </p>
      {plan && (
        <>
          <output>{plan.candidates.length} old revisions eligible</output>
          {plan.candidates.length > 0 && (
            <>
              <ul>
                {plan.candidates.map((file) => (
                  <li key={file.remoteId ?? file.gdriveId}>
                    {file.type}: {file.title} · uploaded {new Date(file.uploadedAt ?? "").toLocaleDateString()}
                  </li>
                ))}
              </ul>
              <button type="button" disabled={disabled || busy} onClick={() => void apply()}>
                Move reviewed revisions to trash
              </button>
            </>
          )}
        </>
      )}
      {message && <output>{message}</output>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
};
