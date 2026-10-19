import "@testing-library/jest-dom";

// Mock IndexedDB for tests
import "fake-indexeddb/auto";
import type {} from "vitest/jsdom";

// Node 25+ exposes its own Web Storage globals. Use the isolated browser
// storage supplied by jsdom, including when Node's storage is unavailable.
// biome-ignore lint/correctness/noUndeclaredVariables: Vitest exposes the jsdom instance in this environment.
const browserWindow = jsdom.window;
Object.defineProperties(globalThis, {
  localStorage: { configurable: true, value: browserWindow.localStorage, writable: true },
  sessionStorage: { configurable: true, value: browserWindow.sessionStorage, writable: true },
});
