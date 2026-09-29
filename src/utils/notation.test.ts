import { describe, expect, it } from "vitest";
import { parseChordPro, stripMetadata, transposeChordPro } from "./chordEngine";
import { cleanChordleContent } from "./chordleImport";

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

  it("converts explicitly German Chordle chords before display and transposition", () => {
    const source = "{x_chordle_notation:German}\n{x_chordle_id:old}\n{key:H}\n[Hm] [H7] [B] [G/H] [G/B]";
    const clean = cleanChordleContent(source);
    expect(clean).not.toContain("x_chordle");
    expect(clean).toContain("{key:B}");
    expect(clean).toContain("[Bm] [B7] [Bb] [G/B] [G/Bb]");
    expect(parseChordPro(source).key).toBe("B");
    expect(parseChordPro(source, { mode: "german" }).key).toBe("H");
    expect(parseChordPro(source, { mode: "german" }).html).toContain("Hm");
    expect(parseChordPro(source, { mode: "german" }).html).toContain("G/B");
    expect(transposeChordPro(source, 0)).toBe(clean);
    expect(stripMetadata(source)).not.toContain("x_chordle");
  });

  it("leaves unmarked chords alone and displays standard B and Bb in German", () => {
    const source = "{key: B}\n[B] [Bm] [Bb] [Bbm] [G/B] [G/Bb]";
    expect(cleanChordleContent(source)).toBe(source);
    const parsed = parseChordPro(source, { mode: "german" });
    expect(parsed.key).toBe("H");
    expect(parsed.html).toContain("Hm");
    expect(parsed.html).toContain("G/H");
    expect(parsed.html).toContain("G/B");
  });

  it("normalizes unambiguous H chords in Chordle songs marked Standard without guessing bare B", () => {
    const source = "{x_chordle_notation:Standard}\n{key:H}\n[Hm] [G/H] [B] [Bb] [D/Fis] [fism]";
    expect(cleanChordleContent(source)).toBe("{key:B}\n[Bm] [G/B] [B] [Bb] [D/F#] [F#m]");
    expect(parseChordPro(source).key).toBe("B");
  });
});
