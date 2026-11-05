import { describe, expect, it } from "vitest";
import {
  chordProToSimple,
  normalizeSimpleSpacing,
  parseChordPro,
  simpleToChordPro,
  transposeChordPro,
} from "./chordEngine";

describe("chordEngine", () => {
  describe("parseChordPro", () => {
    it("should parse a basic ChordPro song", () => {
      const result = parseChordPro(
        "{title: Synthetic Hymn}\n{artist: Traditional}\n{key: G}\n{tempo: 72}\n\n[G]Morning [C]light",
      );

      expect(result.title).toBe("Synthetic Hymn");
      expect(result.artist).toBe("Traditional");
      expect(result.key).toBe("G");
      expect(result.tempo).toBe("72");
      expect(result.html).toContain("Morning");
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

    it("renders an instrumental section as styled chords", () => {
      const container = document.createElement("div");
      container.innerHTML = parseChordPro(
        "{start_of_verse: Instrumental}\n[E7] [A7] [E7] [B7]\n{end_of_verse}\n{start_of_verse: Verse 1}\n[E7]Words\n{end_of_verse}",
      ).html;
      const label = container.querySelector(".section-instrumental");
      expect(label).not.toBeNull();
      const instrumental = label?.closest(".paragraph") ?? label?.parentElement;
      expect(instrumental?.querySelectorAll(".chord").length).toBeGreaterThan(0);
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

  describe("chordProToSimple", () => {
    it("should convert ChordPro to chords-over-words format", () => {
      const result = chordProToSimple("[G]Hello [C]World");
      expect(result).toContain("G     C");
      expect(result).toContain("Hello World");
    });

    it("keeps ordinary comments as directives and turns section-like comments into labels", () => {
      const simple = chordProToSimple(
        "{comment: Play softly}\n{c: Chorus Deutsch}\n{start_of_verse: Verse 1}\n[C]Hello [G]world\n{end_of_verse}",
      );
      expect(simple.split("\n")).toEqual([
        "{comment: Play softly}",
        "Chorus Deutsch",
        "Verse 1",
        "C     G",
        "Hello world",
      ]);
      const chordPro = simpleToChordPro(simple);
      expect(chordPro).toContain("{comment: Play softly}");
      expect(chordPro).toContain("{start_of_verse: Chorus Deutsch}");
    });
  });

  describe("simpleToChordPro", () => {
    it("should convert chords-over-words to ChordPro", () => {
      const result = simpleToChordPro("G     C\nHello World");
      expect(result).toContain("[G]Hello [C]World");
    });

    it("keeps chords on lyrics that start with a section word", () => {
      const result = simpleToChordPro(
        "Verse 1\nC         G\nBridge over troubled water\nAm       F\nChorus girls are singing\nD      G\nIntroducing the band",
      );
      expect(result).toContain("[C]Bridge ove[G]r troubled water");
      expect(result).toContain("[Am]Chorus gi[F]rls are singing");
      expect(result).toContain("[D]Introdu[G]cing the band");
      expect(result).not.toContain("{comment");
    });

    it("leaves 'Intro: C G' style headings between lyrics as comments", () => {
      expect(simpleToChordPro("C\nHello\nIntro: C G Am\nG\nWorld")).toContain("{comment: Intro: C G Am}");
    });
  });
});

it("renders user lyrics, titles, comments and labels as literal text without executable markup", () => {
  const parsed = parseChordPro(
    '{title: <img src=x onerror=alert(1)>}\n{start_of_verse: <svg onload=alert(1)>}\n[C]Words <img src=x onerror=alert(1)> & symbols\n{comment: <script>alert(1)</script>}\n{textcolour: red" onmouseover="alert(1)}\n[G]Last line\n{end_of_verse}',
  );
  const element = document.createElement("div");
  element.innerHTML = parsed.html;
  expect(element.querySelector("img, svg, script, [onerror], [onload], [onmouseover], [style]")).toBeNull();
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
  element.innerHTML = parseChordPro("{comment: Chorus Deutsch}\n[C]Synthetic line\n{comment: Sing softly}").html;
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
  expect(displayed.split("\n").slice(0, 5)).toEqual(["Intro", "C G D/F# Em", "C G D", "", "Chorus"]);
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
