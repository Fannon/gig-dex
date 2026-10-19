import { expect, it } from "vitest";
import { createLibrarySearch, matchesLibrarySearch, tagSearchQuery } from "./librarySearch";

it("reuses a query across independent records without carrying over normalized tags or membership", () => {
  const matches = createLibrarySearch('#"Sunday morning" harbor');
  expect(matches("Harbor", ["Sunday morning"])).toBe(true);
  expect(matches("Harbor", ["Monday"])).toBe(false);
  expect(matches("Acoustic", ["Sunday morning"])).toBe(false);
  expect(matches("HARBOR", ["#SUNDAY MORNING"])).toBe(true);
  const id = "e8dd53cd-ff2f-44fe-a9c0-122f45544f88";
  const membership = createLibrarySearch(id);
  expect(membership("Gig", [], [id])).toBe(true);
  expect(membership("Gig", [], [])).toBe(false);
  expect(membership(id.toUpperCase(), [])).toBe(true);
});

it("builds exact clickable tag filters including spaces, quotes and backslashes", () => {
  for (const tag of ["#Test", "Sunday morning", 'A "quote"', "folder\\name"]) {
    const query = tagSearchQuery(tag);
    expect(matchesLibrarySearch("Unrelated title", [tag.toLocaleLowerCase()], query)).toBe(true);
    expect(matchesLibrarySearch(tag, [], query)).toBe(false);
    expect(matchesLibrarySearch("Unrelated title", [`${tag} extra`], query)).toBe(false);
  }
  expect(tagSearchQuery("#Test")).toBe("#Test");
  expect(tagSearchQuery("Sunday morning")).toBe('#"Sunday morning"');
  expect(matchesLibrarySearch("Harbor", ["Sunday morning"], '#"Sunday morning" harbor')).toBe(true);
  expect(matchesLibrarySearch("Harbor", ["Sunday morning"], '#"Sunday morning" acoustic')).toBe(false);
  expect(matchesLibrarySearch("Harbor", ["Sunday morning"], '#"Sunday\\zmorning"')).toBe(false);
});

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
