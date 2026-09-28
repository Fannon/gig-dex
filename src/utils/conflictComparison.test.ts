import { expect, it } from "vitest";
import type { Song } from "../db";
import { changedFields, lineDifference } from "./conflictComparison";

const song: Song = {
  id: "song",
  title: "Test",
  artist: "Test",
  content: "one\ntwo\nthree",
  tags: [],
  createdAt: "2025-01-01T00:00:00Z",
  lastModified: "2025-01-01T00:00:00Z",
};
it("compares metadata independently of timestamps and content", () => {
  expect(
    changedFields(song, {
      ...song,
      lastModified: "2026-01-01T00:00:00Z",
      content: "changed",
      tempo: 120,
      tags: ["gig"],
    }).map((field) => field.key),
  ).toEqual(["tags", "tempo"]);
});
it("aligns inserted and removed song lines without mislabeling unchanged lines", () => {
  expect(lineDifference("one\ntwo\nthree", "one\nnew\nthree")).toEqual([
    { kind: "same", text: "one" },
    { kind: "removed", text: "two" },
    { kind: "added", text: "new" },
    { kind: "same", text: "three" },
  ]);
});
it("bounds long comparison cost while preserving both complete versions", () => {
  const left = Array.from({ length: 1000 }, (_, i) => `left${i}`).join("\n");
  const right = left.replace("left500", "changed500");
  const diff = lineDifference(left, right);
  expect(
    diff
      .filter((line) => line.kind !== "added")
      .map((line) => line.text)
      .join("\n"),
  ).toBe(left);
  expect(
    diff
      .filter((line) => line.kind !== "removed")
      .map((line) => line.text)
      .join("\n"),
  ).toBe(right);
});
