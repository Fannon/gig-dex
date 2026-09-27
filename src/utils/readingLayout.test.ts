import { describe, expect, it } from "vitest";
import { parseChordPro } from "./chordEngine";
import { readingHtml } from "./readingLayout";

const format = (source: string) => parseChordPro(source).html;
const dom = (html: string) => {
	const element = document.createElement("div");
	element.innerHTML = html;
	return element;
};
describe("word wrapping with chord positions", () => {
	it("preserves all lyrics, whitespace and chords while joining fragments within one word", () => {
		const before = dom(
			format(
				"{start_of_verse: Verse}\n[C]Word without a chord for a while mid[G]word then [Am]more [F]last\n{comment: Quiet}\nNo chords and words\n{end_of_verse}",
			),
		);
		const after = dom(readingHtml(before.innerHTML));
		for (const selector of [".lyrics", ".chord", ".label", ".comment"])
			expect(
				Array.from(after.querySelectorAll(selector))
					.map((el) => el.textContent)
					.join(""),
			).toBe(
				Array.from(before.querySelectorAll(selector))
					.map((el) => el.textContent)
					.join(""),
			);
		const word = Array.from(after.querySelectorAll(".chord-word")).find(
			(el) =>
				Array.from(el.querySelectorAll(".lyrics"))
					.map((lyric) => lyric.textContent)
					.join("") === "midword ",
		);
		expect(word?.querySelector(".chord")?.textContent).toBe("");
		expect(word?.textContent).toContain("Gword");
	});
	it("preserves trailing chords and escapes user content", () => {
		const html = readingHtml(format("[C]Words [G]\n[Am]<img src=x onerror=alert(1)> & original"));
		const element = dom(html);
		expect(element.querySelector("img")).toBeNull();
		expect(element.textContent).toContain("<img src=x onerror=alert(1)>");
		expect(
			Array.from(element.querySelectorAll(".chord"))
				.map((el) => el.textContent)
				.filter(Boolean),
		).toEqual(["C", "G", "Am"]);
	});
});
