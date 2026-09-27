import { describe, expect, it } from "vitest";
import {
	chordProToSimple,
	chordProToText,
	DEMO_SONG,
	getSemitoneDifference,
	getSongKey,
	normalizeSimpleSpacing,
	parseChordPro,
	simpleToChordPro,
	transposeChordPro,
} from "./chordEngine";

describe("chordEngine", () => {
	describe("parseChordPro", () => {
		it("should parse a basic ChordPro song", () => {
			const result = parseChordPro(DEMO_SONG);

			expect(result.title).toBe("Amazing Grace");
			expect(result.artist).toBe("Traditional");
			expect(result.key).toBe("G");
			expect(result.tempo).toBe("72");
			expect(result.html).toContain("Amazing");
		});

		it("should handle songs without metadata", () => {
			const result = parseChordPro("[G]Simple [C]song");

			expect(result.title).toBeNull();
			expect(result.artist).toBeNull();
			expect(result.html).toContain("Simple");
		});

		it("should generate HTML output", () => {
			const result = parseChordPro("{title: Test}\n\n[Am]Hello [G]World");

			expect(result.html).toBeTruthy();
			expect(typeof result.html).toBe("string");
		});
	});

	describe("transposeChordPro", () => {
		it("should return original if transpose is 0", () => {
			const original = "[G]Hello [C]World";
			const result = transposeChordPro(original, 0);

			expect(result).toBe(original);
		});

		it("should transpose up by semitones", () => {
			const original = "{key: G}\n[G]Hello [C]World";
			const result = transposeChordPro(original, 2);

			expect(result).toContain("A");
			expect(result).toContain("D");
		});

		it("should transpose down by semitones", () => {
			const original = "{key: G}\n[G]Hello [C]World";
			const result = transposeChordPro(original, -2);

			expect(result).toContain("F");
		});
	});

	describe("chordProToText", () => {
		it("should convert ChordPro to plain text", () => {
			const result = chordProToText("{title: Test}\n\n[G]Hello World");

			expect(result).toContain("Hello World");
			expect(result).toContain("G");
		});
	});

	describe("getSongKey", () => {
		it("should extract the key from a song", () => {
			const result = getSongKey("{key: Am}\n[Am]Test");

			expect(result).toBe("Am");
		});

		it("should return null if no key is set", () => {
			const result = getSongKey("[C]No key defined");

			expect(result).toBeNull();
		});
	});

	describe("getSemitoneDifference", () => {
		it("should return 0 for same key", () => {
			expect(getSemitoneDifference("C", "C")).toBe(0);
			expect(getSemitoneDifference("G", "G")).toBe(0);
		});

		it("should calculate positive differences", () => {
			expect(getSemitoneDifference("C", "D")).toBe(2);
			expect(getSemitoneDifference("C", "E")).toBe(4);
			expect(getSemitoneDifference("C", "F")).toBe(5);
		});

		it("should calculate negative differences", () => {
			expect(getSemitoneDifference("D", "C")).toBe(-2);
			expect(getSemitoneDifference("E", "C")).toBe(-4);
		});

		it("should handle enharmonic equivalents", () => {
			expect(getSemitoneDifference("C#", "Db")).toBe(0);
			expect(getSemitoneDifference("F#", "Gb")).toBe(0);
		});

		it("should wrap around the octave", () => {
			// From C to B is -1, not +11
			expect(getSemitoneDifference("C", "B")).toBe(-1);
			// From B to C is +1, not -11
			expect(getSemitoneDifference("B", "C")).toBe(1);
		});

		it("should return 0 for invalid keys", () => {
			expect(getSemitoneDifference("X", "Y")).toBe(0);
			expect(getSemitoneDifference("C", "Invalid")).toBe(0);
		});
	});

	describe("chordProToSimple", () => {
		it("should convert ChordPro to chords-over-words format", () => {
			const result = chordProToSimple("[G]Hello [C]World");
			expect(result).toContain("G     C");
			expect(result).toContain("Hello World");
		});
	});

	describe("simpleToChordPro", () => {
		it("should convert chords-over-words to ChordPro", () => {
			const result = simpleToChordPro("G     C\nHello World");
			expect(result).toContain("[G]Hello [C]World");
		});
	});
});

it("renders user lyrics, titles, comments and labels as literal text without executable markup", () => {
	const parsed = parseChordPro(
		'{title: <img src=x onerror=alert(1)>}\n{start_of_verse: <svg onload=alert(1)>}\n[C]Words <img src=x onerror=alert(1)> & symbols\n{comment: <script>alert(1)</script>}\n{textcolour: red" onmouseover="alert(1)}\n[G]Last line\n{end_of_verse}',
	);
	const element = document.createElement("div");
	element.innerHTML = parsed.html;
	expect(
		element.querySelector("img, svg, script, [onerror], [onload], [onmouseover], [style]"),
	).toBeNull();
	expect(element.textContent).toContain("Words <img src=x onerror=alert(1)> & symbols");
	expect(parsed.title).toBe("<img src=x onerror=alert(1)>");
});

it("recognizes complete simple section headings and retains instrumental chord spacing", () => {
	const simple =
		"Intro\n\nC G D/F# Em\n\nChorus\n    C             G\nA synthetic lantern line\nVerse1\nAm    E\nAnother synthetic line\nInterlude\nC Em C D Em\n\nOutro\nG C\n";
	const converted = simpleToChordPro(simple);
	expect(converted).toContain("{start_of_verse: Intro}");
	expect(converted).toContain("[C] [G] [D/F#] [Em]");
	expect(converted).toContain("[C] [Em] [C] [D] [Em]");
	const element = document.createElement("div");
	element.innerHTML = parseChordPro(converted).html;
	expect(Array.from(element.querySelectorAll(".label"), (el) => el.textContent)).toEqual([
		"Intro",
		"Chorus",
		"Verse1",
		"Interlude",
		"Outro",
	]);
	expect(element.querySelector(".section-chorus")).not.toBeNull();
	expect(chordProToSimple(converted)).toContain("C G D/F# Em");
	expect(simpleToChordPro(chordProToSimple(converted))).toContain("{start_of_verse: Chorus}");
});

it("colors section comments from legacy songs without promoting ordinary comments", () => {
	const element = document.createElement("div");
	element.innerHTML = parseChordPro(
		"{comment: Chorus Deutsch}\n[C]Synthetic line\n{comment: Sing softly}",
	).html;
	expect(element.querySelector(".label.section-chorus")?.textContent).toBe("Chorus Deutsch");
	expect(element.querySelector(".comment")?.textContent).toBe("Sing softly");
});

it("normalizes simple spacing while preserving chord columns and lyric paragraph breaks", () => {
	const input =
		"\n\nIntro\n\nC G D/F# Em\n\nC G D\n\n\n\n\nChorus\n\n    C             G\nSynthetic lantern line\n\n\nNext lyric stanza\n\n";
	const normalized = normalizeSimpleSpacing(input);
	expect(normalized).toBe(
		"Intro\nC G D/F# Em\nC G D\n\nChorus\n    C             G\nSynthetic lantern line\n\nNext lyric stanza",
	);
	const converted = simpleToChordPro(input);
	const displayed = chordProToSimple(converted);
	expect(displayed.split("\n").slice(0, 5)).toEqual([
		"Intro",
		"C G D/F# Em",
		"C G D",
		"",
		"Chorus",
	]);
	expect(displayed).not.toMatch(/\n{3}/);
	expect(chordProToSimple(simpleToChordPro(displayed))).toBe(displayed);
	expect(normalizeSimpleSpacing("    C     G\nA lyric\n\n\nAnother stanza")).toBe(
		"    C     G\nA lyric\n\nAnother stanza",
	);
});

it("keeps extended instrumental chords together without treating section names as chords", () => {
	expect(normalizeSimpleSpacing("Intro\nCMaj7 D/F#\n\nCmMaj7 G7(b9)\n\n\nChorus")).toBe(
		"Intro\nCMaj7 D/F#\nCmMaj7 G7(b9)\n\nChorus",
	);
});
