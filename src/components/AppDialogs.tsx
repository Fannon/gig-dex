import { useEffect, useId, useRef, useState } from "react";
import { type ConfirmRequest, setConfirmHandler } from "../utils/confirm";
import { setToastHandler, type Toast } from "../utils/toast";
import "./AppDialogs.scss";

const TOAST_MS = 10000;

/** App-wide confirmation dialog and toast, mounted once beside the router. */
export function AppDialogs() {
  const [queue, setQueue] = useState<{ request: ConfirmRequest; resolve: (ok: boolean) => void }[]>([]);
  const [toast, setToast] = useState<(Toast & { id: number }) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  const current = queue[0];

  useEffect(() => {
    setConfirmHandler((request) => new Promise((resolve) => setQueue((items) => [...items, { request, resolve }])));
    setToastHandler((next) => setToast({ ...next, id: Date.now() }));
    return () => {
      setConfirmHandler(undefined);
      setToastHandler(undefined);
    };
  }, []);
  useEffect(() => {
    if (!current) return;
    dialog.current?.showModal();
    (current.request.danger ? cancel : confirm).current?.focus();
  }, [current]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const answer = (ok: boolean) => {
    if (!current) return;
    dialog.current?.close();
    current.resolve(ok);
    setQueue((items) => items.slice(1));
  };

  return (
    <>
      {current && (
        <dialog
          ref={dialog}
          className="app-confirm"
          role="alertdialog"
          aria-labelledby={titleId}
          aria-describedby={current.request.message ? messageId : undefined}
          onCancel={(event) => {
            event.preventDefault();
            answer(false);
          }}
        >
          <h2 id={titleId}>{current.request.title}</h2>
          {current.request.message && <p id={messageId}>{current.request.message}</p>}
          <div className="app-confirm__actions">
            <button ref={cancel} type="button" onClick={() => answer(false)}>
              {current.request.cancelLabel ?? "Cancel"}
            </button>
            <button
              ref={confirm}
              type="button"
              className={current.request.danger ? "app-confirm__danger" : "app-confirm__primary"}
              onClick={() => answer(true)}
            >
              {current.request.confirmLabel}
            </button>
          </div>
        </dialog>
      )}
      <output className="app-toast" hidden={!toast}>
        {toast && (
          <>
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  setToast(null);
                  void toast.action?.();
                }}
              >
                {toast.actionLabel}
              </button>
            )}
            <button type="button" className="app-toast__close" aria-label="Dismiss" onClick={() => setToast(null)}>
              ×
            </button>
          </>
        )}
      </output>
    </>
  );
}
