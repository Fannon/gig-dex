import { expect, it } from "vitest";
import { contentSignature, readingPages } from "./readingPosition";

it("keeps every part of long songs reachable with overlap and a final full viewport", () => {
  const pages = readingPages(
    300,
    1700,
    Array.from({ length: 40 }, (_, i) => i * 45),
  );
  expect(pages[0]).toBe(0);
  expect(pages.at(-1)).toBe(1440);
  for (let index = 1; index < pages.length; index++) {
    expect(pages[index]).toBeGreaterThan(pages[index - 1]);
    expect(pages[index] - pages[index - 1]).toBeLessThanOrEqual(300);
  }
  expect(readingPages(300, 1700, [])).toEqual([0, 268, 536, 804, 1072, 1340, 1400]);
  expect(readingPages(0, 1700, [])).toEqual([0]);
  expect(readingPages(300, 200, [])).toEqual([0]);
});
it("invalidates reading positions when source changes", () => {
  expect(contentSignature("abc")).not.toBe(contentSignature("abd"));
  expect(contentSignature("abc")).toBe(contentSignature("abc"));
});
