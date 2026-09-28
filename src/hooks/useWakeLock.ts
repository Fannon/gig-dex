import { useEffect, useState } from "react";

export function useWakeLock() {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem("performance_awake") === "true";
    } catch {
      return false;
    }
  });
  const [status, setStatus] = useState("Off");
  useEffect(() => {
    if (!enabled) {
      setStatus("Off");
      return;
    }
    if (!navigator.wakeLock) {
      setStatus("Unavailable in this browser");
      return;
    }
    let disposed = false;
    let pending = false;
    let lock: WakeLockSentinel | undefined;
    const acquire = async () => {
      if (disposed || pending || lock || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (disposed || document.visibilityState !== "visible") {
          await next.release();
          return;
        }
        lock = next;
        setStatus("Active");
        next.addEventListener("release", () => {
          if (lock === next) lock = undefined;
          if (!disposed) setStatus("Released — tap Retry");
        });
      } catch {
        if (!disposed) setStatus("Unavailable — tap Retry");
      } finally {
        pending = false;
      }
    };
    const visibility = () => {
      if (document.visibilityState === "visible") void acquire();
      else setStatus("Paused while hidden");
    };
    void acquire();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("gigdex-wake-retry", acquire);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("gigdex-wake-retry", acquire);
      void lock?.release().catch(() => {});
    };
  }, [enabled]);
  return {
    enabled,
    status,
    toggle: () => {
      setEnabled((value) => {
        try {
          localStorage.setItem("performance_awake", String(!value));
        } catch {
          /* Optional preference. */
        }
        return !value;
      });
    },
    retry: () => window.dispatchEvent(new Event("gigdex-wake-retry")),
  };
}
