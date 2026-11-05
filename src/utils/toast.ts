export interface Toast {
  message: string;
  actionLabel?: string;
  action?: () => void | Promise<void>;
}

type ToastHandler = (toast: Toast) => void;
let handler: ToastHandler | undefined;

/** Registered by the in-app toast host. */
export function setToastHandler(next: ToastHandler | undefined) {
  handler = next;
}

/** Show a short message, optionally with one action such as Undo. */
export function showToast(toast: Toast) {
  handler?.(toast);
}
