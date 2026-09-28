import { expect, it } from "vitest";
import { parseChordPro } from "./chordEngine";
import { simpleSectionLabel, songSection } from "./songSections";

it("classifies English/German sections and separates prechorus from chorus", () => {
  for (const label of ["Chorus", "Refrain 2", "Hook"]) expect(songSection(label)).toBe("chorus");
  expect(songSection("Pre-Chorus")).toBe("prechorus");
  expect(songSection("Strophe 1")).toBe("verse");
  expect(songSection("Bridge")).toBe("bridge");
  expect(songSection("Intro")).toBe("intro");
  expect(songSection("Outro")).toBe("outro");
  expect(songSection("Solo")).toBe("instrumental");
  expect(songSection("My unusual section")).toBe("other");
});
it("annotates only sanitized rendered labels and retains source text", () => {
  const html = parseChordPro("{start_of_verse: Refrain}\n[C]Synthetic line\n{end_of_verse}").html;
  expect(html).toContain("section-chorus");
  expect(html).toContain("Synthetic");
});

it("recognizes collection heading variants without swallowing lyric sentences", () => {
  for (const heading of [
    "Verse1",
    "Verse 15",
    "Chorus English",
    "Chorus Deutsch",
    "Pre Chorus",
    "Prechorus",
    "[Refrain 2]",
    "Bridge:",
    "Interlude 1",
    "Strophe 2",
    "tag",
  ]) {
    expect(simpleSectionLabel(heading)).not.toBeNull();
  }
  for (const lyric of [
    "Chorus voices fill the air",
    "Intro to a new day",
    "Verse after verse we sing",
    "[C]",
    "C G D",
    "Bridge across the river",
  ]) {
    expect(simpleSectionLabel(lyric)).toBeNull();
  }
});
