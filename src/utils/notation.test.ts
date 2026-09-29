import { describe, expect, it } from "vitest";
import { parseChordPro } from "./chordEngine";

describe("chordEngine Nashville support", () => {
  const chordPro = `
{title: Test Song}
{key: G}
[G] [G7] [C] [D] [Em]
    `.trim();

  it("should parse standard chords", () => {
    const parsed = parseChordPro(chordPro, { mode: "standard" });
    expect(parsed.html).toContain("G");
    expect(parsed.html).toContain("C");
  });

  it("should converted to Nashville numbers", () => {
    const parsed = parseChordPro(chordPro, { mode: "nashville" });
    expect(parsed.html).toContain("1⁷"); // G7 -> 1⁷
    expect(parsed.html).toContain("4");
    expect(parsed.html).toContain("5");
    expect(parsed.html).toContain("6ᵐ");
    expect(parsed.html).not.toContain(">G<");
  });

  it("should converted to Roman numerals", () => {
    const parsed = parseChordPro(chordPro, { mode: "roman" });
    expect(parsed.html).toContain("I");
    expect(parsed.html).toContain("IV");
    expect(parsed.html).toContain("V");
    expect(parsed.html).toContain("VIᵐ");
  });

  it("should handle missing key by falling back to standard", () => {
    const noKeyChordPro = `[G] [C]`;
    const parsed = parseChordPro(noKeyChordPro, { mode: "nashville" });
    expect(parsed.html).toContain("G");
  });

  it("displays standard B and Bb in German without changing the source", () => {
    const source = "{key: B}\n[B] [Bm] [Bb] [Bbm] [G/B] [G/Bb]";
    expect(parseChordPro(source).key).toBe("B");
    const parsed = parseChordPro(source, { mode: "german" });
    expect(parsed.key).toBe("H");
    expect(parsed.html).toContain("Hm");
    expect(parsed.html).toContain("G/H");
    expect(parsed.html).toContain("G/B");
  });
});
