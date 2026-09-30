import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { addSyncActivity, readSyncActivity, type SyncActivity } from "../sync/activity";
import { SyncActivityLog } from "./SyncActivityLog";

const entry: SyncActivity = {
  provider: "Local Folder",
  time: "2026-09-29T19:40:10Z",
  kind: "success",
  message: "Sync completed.",
};

beforeEach(() => localStorage.clear());
afterEach(cleanup);

it("keeps old activity readable, ignores invalid stats and filters other providers", () => {
  localStorage.setItem(
    "gigdex-sync-activity",
    JSON.stringify([
      entry,
      { ...entry, stats: { sent: { added: -1, updated: 0, removed: 0 }, received: {} } },
      { ...entry, provider: "Dropbox", message: "Another provider" },
    ]),
  );
  expect(readSyncActivity()[1].stats).toBeUndefined();
  render(<SyncActivityLog provider="Local Folder" />);
  expect(screen.getAllByText("Sync completed.")).toHaveLength(2);
  expect(screen.queryByText("Another provider")).toBeNull();
  expect(screen.queryByText(/added/)).toBeNull();
  expect(screen.queryByText("No changes sent or received.")).toBeNull();
});

it("shows live directional counts, no changes on a later sync and completed changes on errors", () => {
  render(<SyncActivityLog provider="Local Folder" />);
  expect(screen.getByText("Your sync activity will appear here.")).toBeTruthy();
  act(() =>
    addSyncActivity({
      ...entry,
      stats: {
        sent: { added: 3, updated: 2, removed: 1 },
        received: { added: 1, updated: 4, removed: 2 },
      },
    }),
  );
  expect(screen.getByText("Counts include songs and setlists.")).toBeTruthy();
  expect(screen.getByText("Sent: 3 added · 2 updated · 1 removed")).toBeTruthy();
  expect(screen.getByText("Received: 1 added · 4 updated · 2 removed")).toBeTruthy();

  act(() =>
    addSyncActivity({
      ...entry,
      stats: {
        sent: { added: 0, updated: 0, removed: 0 },
        received: { added: 0, updated: 0, removed: 0 },
      },
    }),
  );
  expect(screen.getByText("No changes sent or received.")).toBeTruthy();

  act(() =>
    addSyncActivity({
      ...entry,
      kind: "error",
      message: "Sync incomplete: 1 item failed.",
      stats: {
        sent: { added: 0, updated: 0, removed: 0 },
        received: { added: 2, updated: 0, removed: 0 },
      },
    }),
  );
  const latest = within(screen.getAllByRole("listitem")[0]);
  expect(latest.getByText("Sync incomplete: 1 item failed.")).toBeTruthy();
  expect(latest.getByText("Received: 2 added · 0 updated · 0 removed")).toBeTruthy();
  expect(latest.queryByText("No changes sent or received.")).toBeNull();
});
