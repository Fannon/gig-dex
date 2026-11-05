import { useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";
import { blockPwaUpdate } from "../pwa/lifecycle";
import { confirmAction, discardChangesRequest } from "../utils/confirm";

export function useUnsavedEdits(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const release = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    if (!dirty) return;
    release.current = blockPwaUpdate("editing");
    return () => {
      release.current?.();
      release.current = undefined;
    };
  }, [dirty]);
  const handled = useRef(false);
  const blocker = useBlocker(() => dirtyRef.current);
  useEffect(() => {
    if (blocker.state !== "blocked") {
      handled.current = false;
      return;
    }
    if (handled.current) return;
    handled.current = true;
    void confirmAction(discardChangesRequest).then((discard) => (discard ? blocker.proceed?.() : blocker.reset?.()));
  }, [blocker]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  return () => {
    dirtyRef.current = false;
    release.current?.();
    release.current = undefined;
  };
}
