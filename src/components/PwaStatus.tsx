import { useLocation } from "react-router-dom";
import { applyPwaUpdate, usePwaState } from "../pwa/lifecycle";
import "./PwaStatus.scss";

export function PwaStatus() {
  const state = usePwaState();
  const location = useLocation();
  // Keep performance mode free of banners; updates remain available after exiting.
  if (location.pathname.startsWith("/perform/")) return null;
  if (!state.update && state.online && !state.error) return null;
  return (
    <aside className="pwa-status" aria-label="App status">
      {!state.online && <span>Offline · using your local library</span>}
      {state.update && (
        <>
          <span>
            Update available
            {state.blocked ? " · save edits or finish the current operation to restart" : ""}
          </span>
          <button type="button" disabled={state.blocked || state.updating} onClick={() => void applyPwaUpdate()}>
            {state.updating ? "Updating…" : "Update and restart"}
          </button>
        </>
      )}
      {state.error && <span role="alert">{state.error}</span>}
    </aside>
  );
}
