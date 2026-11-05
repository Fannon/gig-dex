import { describe, expect, it } from "vitest";
import { getAllSetlists, getSong, initDB } from "../db";
import { chordProToSimple, extractMetadata, parseChordPro, simpleToChordPro, stripMetadata } from "./chordEngine";
import { addDemoLibrary, DEMO_SONGS } from "./demoSongs";
import { simpleSectionLabel } from "./songSections";

const rendered = (content: string) => {
  const element = document.createElement("div");
  element.innerHTML = parseChordPro(content).html;
  const texts = (selector: string) =>
    Array.from(element.querySelectorAll(selector), (node) => node.textContent?.trim());
  return { labels: texts(".label"), comments: texts(".comment"), chords: texts(".chord").filter(Boolean) };
};

describe.each(DEMO_SONGS.map(({ content }) => [extractMetadata(content).title, content]))("%s", (_, content) => {
  it("has the metadata shown in the song header", () => {
    const metadata = extractMetadata(content);
    expect(metadata).toMatchObject({ artist: "Gig-Dex Demo" });
    expect(metadata.key).toBeTruthy();
    expect(metadata.tempo).toBeGreaterThan(0);
    expect(metadata.time).toMatch(/^\d\/\d$/);
  });

  it("uses section labels the simple editor recognizes", () => {
    const labels = [...content.matchAll(/\{start_of_\w+:\s*([^}]+)\}/g)].map((match) => match[1]);
    expect(labels.length).toBeGreaterThan(2);
    for (const label of labels) expect(simpleSectionLabel(label), label).toBe(label);
  });

  it("keeps sections, tips and chords when saved from the simple editor", () => {
    const resaved = simpleToChordPro(chordProToSimple(stripMetadata(content)));
    expect(rendered(resaved)).toEqual(rendered(content));
  });
});

it("adds the demo songs and a Demo Night setlist with a transposed encore", async () => {
  const db = await initDB();
  await Promise.all([db.clear("songs"), db.clear("setlists")]);
  const { songId: firstId, setlistId } = await addDemoLibrary();
  expect(await getSong(firstId)).toMatchObject({ title: "Hello, Songbook", key: "G", tempo: 96, time: "4/4" });
  const [setlist] = await getAllSetlists();
  expect(setlist).toMatchObject({ id: setlistId, name: "Demo Night" });
  expect(setlist.songIds).toHaveLength(4);
  expect(setlist.songIds.at(-1)).toBe(firstId);
  expect(setlist.songSettings?.map((setting) => setting.transpose)).toEqual([0, 0, 0, 2]);
});
