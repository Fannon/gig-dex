import { expect, it } from "vitest";
import { matchesLibrarySearch } from "./librarySearch";

it("matches exact tags regardless of case or stored hash prefix", () => {
  expect(matchesLibrarySearch("Harbor", ["Test", "#folk"], "#test #FOLK")).toBe(true);
  expect(matchesLibrarySearch("#test in the title", [], "#test")).toBe(false);
  expect(matchesLibrarySearch("Harbor", ["testing"], "#test")).toBe(false);
  expect(matchesLibrarySearch("Harbor", ["test"], "#test harbor")).toBe(true);
  expect(matchesLibrarySearch("Harbor", ["test"], "#test acoustic")).toBe(false);
});
it("keeps ordinary text and punctuation as literal search terms", () => {
  expect(matchesLibrarySearch("Harbor [North] Alternative", [], "[north] alternative")).toBe(true);
  expect(matchesLibrarySearch("Harbor", [], "")).toBe(true);
});
it("only searches membership using a complete song ID", () => {
  const id = "e8dd53cd-ff2f-44fe-a9c0-122f45544f88";
  expect(matchesLibrarySearch("Gig", ["test"], `${id} #test`, [id])).toBe(true);
  expect(matchesLibrarySearch("Gig", [], id.slice(0, 12), [id])).toBe(false);
  expect(matchesLibrarySearch("Gig", [], id, [])).toBe(false);
});
