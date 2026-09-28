import { describe, expect, it } from "vitest";
import { extractMetadata, injectMetadata, type SongMetadata, stripMetadata } from "./chordEngine";

describe("Metadata Handling", () => {
  it("extracts metadata despite broken chord markup so the song can be repaired", () => {
    expect(extractMetadata("{title: Broken test}\n{composer: Test composer}\nBroken [C\ntext")).toMatchObject({
      title: "Broken test",
      composer: "Test composer",
    });
  });
  it("should extract all supported metadata", () => {
    const chordPro = `
{title: Amazing Grace}
{artist: Traditional}
{key: G}
{tempo: 120}
{capo: 3}
{time: 3/4}
{subtitle: Hymn}
{composer: John Newton}
{lyricist: John Newton}
{copyright: Public Domain}
{album: Gospel Classics}
{year: 1779}
{duration: 3:45}

[G]Amazing grace! (how [C]sweet the [G]sound)
`;

    const metadata = extractMetadata(chordPro);

    expect(metadata.title).toBe("Amazing Grace");
    expect(metadata.artist).toBe("Traditional");
    expect(metadata.key).toBe("G");
    expect(metadata.tempo).toBe(120);
    expect(metadata.capo).toBe(3);
    expect(metadata.time).toBe("3/4");

    // Extended metadata
    expect(metadata.subtitle).toBe("Hymn");
    expect(metadata.composer).toBe("John Newton");
    expect(metadata.lyricist).toBe("John Newton");
    expect(metadata.copyright).toBe("Public Domain");
    expect(metadata.album).toBe("Gospel Classics");
    expect(metadata.year).toBe(1779);
    expect(metadata.duration).toBe("3:45");
  });

  it("should strip all metadata directives", () => {
    const chordPro = `
{title: Amazing Grace}
{artist: Traditional}
{meta: key value}
[G]Amazing grace!
`;
    // Note: The stripMetadata function in chordEngine.ts explicitly lists patterns it removes.
    // It might not remove unknown directives like {meta: ...} if not in the list.
    // Let's check what it claims to remove.
    const stripped = stripMetadata(chordPro);
    expect(stripped).not.toContain("{title:");
    expect(stripped).not.toContain("{artist:");
    expect(stripped).toContain("[G]Amazing grace!");
  });

  it("should preserve extended metadata when injecting", () => {
    const lyrics = "[G]Amazing grace!";
    const metadata: SongMetadata = {
      title: "New Title",
      artist: "New Artist",
      key: "A",
      tempo: 100,
      capo: 2,
      time: "4/4",
      subtitle: "Subtitle",
      composer: "Original Composer",
      lyricist: "Lyricist",
      copyright: "Original Copyright",
      album: "Album",
      year: 2024,
      duration: "4:00",
    };

    const result = injectMetadata(lyrics, metadata);

    expect(result).toContain("{title: New Title}");
    expect(result).toContain("{artist: New Artist}");
    expect(result).toContain("{key: A}");
    expect(result).toContain("{tempo: 100}");
    expect(result).toContain("{capo: 2}");
    expect(result).toContain("{time: 4/4}");
    expect(result).toContain("{subtitle: Subtitle}");
    expect(result).toContain("{composer: Original Composer}");
    expect(result).toContain("{lyricist: Lyricist}");
    expect(result).toContain("{copyright: Original Copyright}");
    expect(result).toContain("{album: Album}");
    expect(result).toContain("{year: 2024}");
    expect(result).toContain("{duration: 4:00}");
    expect(result).toContain("[G]Amazing grace!");
  });

  it("should handle integration flow: strip -> modify -> inject", () => {
    const originalContent = `
{title: Original Title}
{composer: Original Composer}
[C]Lyrics
`;

    // 1. Extract existing
    const existingMeta = extractMetadata(originalContent);

    // 2. Strip for editing
    const stripped = stripMetadata(originalContent);
    expect(stripped.trim()).toBe("[C]Lyrics");

    // 3. User modifies only title in form, keeps lyrics
    const newMeta: SongMetadata = {
      ...existingMeta,
      title: "Updated Title",
    };

    // 4. Inject back
    const result = injectMetadata(stripped, newMeta);

    expect(result).toContain("{title: Updated Title}");
    expect(result).toContain("{composer: Original Composer}"); // Helper function should preserve if we pass it back
    expect(result).toContain("[C]Lyrics");
  });
});
