import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  LIBRARY_CHANGED_EVENT,
  LIBRARY_MUTATED_EVENT,
  notifyLibraryChanged,
  notifyLibraryMutated,
  startLibraryEvents,
} from "./libraryEvents";

class Channel {
  static instances: Channel[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();
  name: string;
  constructor(name: string) {
    this.name = name;
    Channel.instances.push(this);
  }
}
let stop: () => void;
const changed = vi.fn();
const mutated = vi.fn();
beforeEach(() => {
  Channel.instances = [];
  vi.stubGlobal("BroadcastChannel", Channel);
  window.addEventListener(LIBRARY_CHANGED_EVENT, changed);
  window.addEventListener(LIBRARY_MUTATED_EVENT, mutated);
  stop = startLibraryEvents();
});
afterEach(() => {
  stop();
  window.removeEventListener(LIBRARY_CHANGED_EVENT, changed);
  window.removeEventListener(LIBRARY_MUTATED_EVENT, mutated);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("broadcasts committed edits and sync refreshes, but received invalidations never echo or trigger sync", () => {
  const connection = Channel.instances[0];
  notifyLibraryMutated();
  notifyLibraryChanged();
  expect(changed).toHaveBeenCalledTimes(2);
  expect(mutated).toHaveBeenCalledTimes(1);
  expect(connection.postMessage.mock.calls).toEqual([["changed"], ["changed"]]);
  connection.onmessage?.(new MessageEvent("message", { data: "changed" }));
  expect(changed).toHaveBeenCalledTimes(3);
  expect(mutated).toHaveBeenCalledTimes(1);
  expect(connection.postMessage).toHaveBeenCalledTimes(2);
  connection.onmessage?.(new MessageEvent("message", { data: "unrelated" }));
  expect(changed).toHaveBeenCalledTimes(3);
});

it("starts once, cleans up and can reconnect", () => {
  const duplicateStop = startLibraryEvents();
  expect(Channel.instances).toHaveLength(1);
  duplicateStop();
  expect(Channel.instances[0].close).not.toHaveBeenCalled();
  stop();
  expect(Channel.instances[0].close).toHaveBeenCalledTimes(1);
  expect(Channel.instances[0].onmessage).toBeNull();
  notifyLibraryChanged();
  expect(Channel.instances[0].postMessage).not.toHaveBeenCalled();
  stop = startLibraryEvents();
  expect(Channel.instances).toHaveLength(2);
});

it("keeps local saves working when messaging is unsupported, denied or fails", () => {
  Channel.instances[0].postMessage.mockImplementation(() => {
    throw new Error("Channel unavailable");
  });
  expect(() => notifyLibraryMutated()).not.toThrow();
  stop();
  vi.stubGlobal("BroadcastChannel", undefined);
  stop = startLibraryEvents();
  expect(() => notifyLibraryMutated()).not.toThrow();
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      constructor() {
        throw new Error("Channel denied");
      }
    },
  );
  stop = startLibraryEvents();
  expect(() => notifyLibraryMutated()).not.toThrow();
  expect(changed).toHaveBeenCalledTimes(3);
  expect(mutated).toHaveBeenCalledTimes(3);
});
