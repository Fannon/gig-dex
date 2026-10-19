import { Link, useLocation } from "react-router-dom";
import { usePwaState } from "../pwa/lifecycle";
import { ActionIcon } from "./ActionIcon";
import { PwaUpdateControls } from "./PwaUpdateControls";
import "./PwaStatus.scss";

export function PwaStatus() {
  const state = usePwaState();
  const location = useLocation();
  // Keep performance mode free of banners; updates remain available after exiting.
  if (location.pathname.startsWith("/perform/")) return null;
  if (!state.update && state.online && !state.error) return null;
  return (
    <details
      className="pwa-status"
      data-error={!!state.error}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        aria-label={
          state.update ? "App update ready" : state.error ? "App status needs attention" : "Offline app status"
        }
        title={
          state.update
            ? "App update ready — restart to apply"
            : state.error
              ? "App status needs attention"
              : "Offline · using your local library"
        }
      >
        <ActionIcon name={state.update ? "update" : "info"} />
        <span className="pwa-status__dot" aria-hidden="true" />
      </summary>
      <section className="pwa-status__panel" aria-label="App status">
        <h2>{state.update ? "Update ready" : !state.online ? "You’re offline" : "App needs attention"}</h2>
        {!state.online && <p>Offline · using your local library</p>}
        {state.update && <PwaUpdateControls state={state} />}
        {state.error && <p role="alert">{state.error}</p>}
        <Link to="/settings?section=offline">Offline app settings</Link>
      </section>
    </details>
  );
}
