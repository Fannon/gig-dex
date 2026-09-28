import { type ReactNode, useEffect, useRef } from "react";

/** Native modal supplies keyboard dismissal, focus trapping, and focus restoration. */
export const WorkspaceDialog = ({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) => {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="setlists-page__modal"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close dialog">
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
};
