import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWakeLock } from "./useWakeLock";

const sentinel = () => {
  const target = new EventTarget();
  const release = vi.fn(async () => target.dispatchEvent(new Event("release")));
  return Object.assign(target, { release });
};
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("performance screen wake lock", () => {
  it("remembers opt-in, reacquires after returning and releases on exit", async () => {
    const first = sentinel();
    const second = sentinel();
    const request = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
    const { result, unmount } = renderHook(useWakeLock);
    expect(request).not.toHaveBeenCalled();
    act(() => result.current.toggle());
    await waitFor(() => expect(result.current.status).toBe("Active"));
    expect(localStorage.getItem("performance_awake")).toBe("true");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => {
      await first.release();
      document.dispatchEvent(new Event("visibilitychange"));
    });
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.status).toBe("Active"));
    unmount();
    expect(second.release).toHaveBeenCalledOnce();
  });
  it("releases a late result after the user switches it off", async () => {
    let resolve: (value: ReturnType<typeof sentinel>) => void = () => {};
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request: () =>
          new Promise((done) => {
            resolve = done;
          }),
      },
    });
    const { result } = renderHook(useWakeLock);
    act(() => result.current.toggle());
    act(() => result.current.toggle());
    const lock = sentinel();
    await act(async () => resolve(lock));
    expect(lock.release).toHaveBeenCalledOnce();
    expect(result.current.status).toBe("Off");
  });
  it("reports denial and allows retry without looping", async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error("denied")).mockResolvedValue(sentinel());
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request } });
    const { result } = renderHook(useWakeLock);
    act(() => result.current.toggle());
    await waitFor(() => expect(result.current.status).toContain("Retry"));
    expect(request).toHaveBeenCalledOnce();
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("Active"));
  });
  it("reports unsupported browsers", () => {
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: undefined });
    localStorage.setItem("performance_awake", "true");
    const { result } = renderHook(useWakeLock);
    expect(result.current.status).toBe("Unavailable in this browser");
  });
});
