export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive actions get danger styling and focus Cancel first. */
  danger?: boolean;
}

type ConfirmHandler = (request: ConfirmRequest) => Promise<boolean>;
let handler: ConfirmHandler | undefined;

/** Registered by the in-app dialog host; without one, the browser dialog is used. */
export function setConfirmHandler(next: ConfirmHandler | undefined) {
  handler = next;
}

/** Ask the user to confirm an action. Usable from React components and plain modules alike. */
export function confirmAction(request: ConfirmRequest): Promise<boolean> {
  if (handler) return handler(request);
  return Promise.resolve(window.confirm([request.title, request.message].filter(Boolean).join("\n\n")));
}

export const discardChangesRequest: ConfirmRequest = {
  title: "Discard unsaved changes?",
  message: "Your changes have not been saved.",
  confirmLabel: "Discard changes",
  cancelLabel: "Keep editing",
  danger: true,
};
