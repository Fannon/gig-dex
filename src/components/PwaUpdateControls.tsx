import { applyPwaUpdate, cancelPwaUpdate, type PwaState } from "../pwa/lifecycle";

const instructions = {
  editing: "Save or discard your unsaved edits.",
  performance: "Exit performance mode.",
  sync: "Wait for sync to finish.",
  operation: "Wait for the current library operation to finish.",
};

export function PwaUpdateControls({ state, disabled = false }: { state: PwaState; disabled?: boolean }) {
  return (
    <div className="pwa-update-controls">
      <p>
        {state.updateQueued
          ? "Restart scheduled. Gig-Dex will restart when your current work finishes."
          : "The update is downloaded. Restart Gig-Dex to use the new version; your saved library stays on this device."}
      </p>
      {state.blockReasons.map((reason) => (
        <p key={reason}>{instructions[reason]}</p>
      ))}
      {state.updateQueued ? (
        <button type="button" onClick={cancelPwaUpdate}>
          Cancel restart
        </button>
      ) : (
        <button type="button" disabled={disabled || state.updating} onClick={() => void applyPwaUpdate()}>
          {state.updating ? "Updating…" : state.blocked ? "Restart when ready" : "Update and restart"}
        </button>
      )}
    </div>
  );
}
