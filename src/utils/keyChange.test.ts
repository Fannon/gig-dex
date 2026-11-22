import { describe, expect, it } from "vitest";
import { keyChoices, shiftedKeyName, transposeChordProText } from "./keyChange";

describe("changing a song's key", () => {
  it("names keys conventionally, keeping major or minor", () => {
    expect(shiftedKeyName("G", 2)).toBe("A");
    expect(shiftedKeyName("G", 3)).toBe("Bb");
    expect(shiftedKeyName("Em", 1)).toBe("Fm");
    expect(shiftedKeyName("Em", 2)).toBe("F#m");
    expect(shiftedKeyName("C#", -1)).toBe("C");
    expect(shiftedKeyName("H", 1)).toBeNull();
  });
  it("offers the other eleven keys with the shortest move", () => {
    const choices = keyChoices("G");
    expect(choices).toHaveLength(11);
    expect(choices.find((choice) => choice.key === "A")?.delta).toBe(2);
    expect(choices.find((choice) => choice.key === "C")?.delta).toBe(5);
    expect(choices.find((choice) => choice.key === "Db")?.delta).toBe(6);
    expect(choices.find((choice) => choice.key === "D")?.delta).toBe(-5);
    expect(keyChoices(undefined)).toEqual([]);
  });
  it("moves only chords and key directives, keeping the rest of the text", () => {
    const source = [
      "{title: Synthetic [Live]}",
      "{key: G}",
      "{comment: Capo-free, play [G] softly}",
      "",
      "{start_of_verse: Verse 1}",
      "[G]Line [D/F#]one   with [Cmaj7]spacing [Gsus4]and [Em7]more",
      "[*Rit.]Slow [N.C.]stop [1]number [G7(b9)]end",
      "{end_of_verse}",
      "{key: Em}",
    ].join("\n");
    expect(transposeChordProText(source, 2, "A")).toBe(
      [
        "{title: Synthetic [Live]}",
        "{key: A}",
        "{comment: Capo-free, play [A] softly}",
        "",
        "{start_of_verse: Verse 1}",
        "[A]Line [E/G#]one   with [Dmaj7]spacing [Asus4]and [F#m7]more",
        "[*Rit.]Slow [N.C.]stop [1]number [A7(b9)]end",
        "{end_of_verse}",
        "{key: F#m}",
      ].join("\n"),
    );
  });
  it("spells chords for the target key", () => {
    expect(transposeChordProText("[G][D/F#][C]", 3, "Bb")).toBe("[Bb][F/A][Eb]");
    expect(transposeChordProText("[Bb][F/A]", -3, "G")).toBe("[G][D/F#]");
    expect(transposeChordProText("[A][E]", 1, "Bb")).toBe("[Bb][F]");
    expect(transposeChordProText("[G]", 0, "G")).toBe("[G]");
  });
  it("keeps naturals natural and returns to the same chords after a round trip", () => {
    const source = "[G][C][D][Em][F#m7b5][Bb/D][C6/9][Am/G][B7][E/G#]";
    for (const [delta, key] of [
      [-3, "E"],
      [3, "Bb"],
      [5, "C"],
      [-1, "F#"],
      [6, "Db"],
    ] as const) {
      const moved = transposeChordProText(source, delta, key);
      expect(moved).not.toMatch(/B#|E#|Cb|Fb/);
      expect(transposeChordProText(moved, -delta, "G")).toBe("[G][C][D][Em][F#m7b5][A#/D][C6/9][Am/G][B7][E/G#]");
    }
  });
});
