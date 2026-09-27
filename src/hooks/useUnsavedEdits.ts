import { useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

export function useUnsavedEdits(dirty: boolean) {
	const dirtyRef = useRef(dirty);
	dirtyRef.current = dirty;
	const handled = useRef(false);
	const blocker = useBlocker(() => dirtyRef.current);
	useEffect(() => {
		if (blocker.state !== "blocked") {
			handled.current = false;
			return;
		}
		if (handled.current) return;
		handled.current = true;
		if (window.confirm("Discard unsaved changes?")) blocker.proceed();
		else blocker.reset();
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
	};
}
