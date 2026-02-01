import { describe, it, expect } from 'vitest';
import {
  parseChordPro,
  transposeChordPro,
  chordProToText,
  getSongKey,
  getSemitoneDifference,
  DEMO_SONG,
} from './chordEngine';

describe('chordEngine', () => {
  describe('parseChordPro', () => {
    it('should parse a basic ChordPro song', () => {
      const result = parseChordPro(DEMO_SONG);

      expect(result.title).toBe('Amazing Grace');
      expect(result.artist).toBe('Traditional');
      expect(result.key).toBe('G');
      expect(result.tempo).toBe('72');
      expect(result.html).toContain('Amazing');
    });

    it('should handle songs without metadata', () => {
      const result = parseChordPro('[G]Simple [C]song');

      expect(result.title).toBeNull();
      expect(result.artist).toBeNull();
      expect(result.html).toContain('Simple');
    });

    it('should generate HTML output', () => {
      const result = parseChordPro('{title: Test}\n\n[Am]Hello [G]World');

      expect(result.html).toBeTruthy();
      expect(typeof result.html).toBe('string');
    });
  });

  describe('transposeChordPro', () => {
    it('should return original if transpose is 0', () => {
      const original = '[G]Hello [C]World';
      const result = transposeChordPro(original, 0);

      expect(result).toBe(original);
    });

    it('should transpose up by semitones', () => {
      const original = '{key: G}\n[G]Hello [C]World';
      const result = transposeChordPro(original, 2);

      expect(result).toContain('A');
      expect(result).toContain('D');
    });

    it('should transpose down by semitones', () => {
      const original = '{key: G}\n[G]Hello [C]World';
      const result = transposeChordPro(original, -2);

      expect(result).toContain('F');
    });
  });

  describe('chordProToText', () => {
    it('should convert ChordPro to plain text', () => {
      const result = chordProToText('{title: Test}\n\n[G]Hello World');

      expect(result).toContain('Hello World');
      expect(result).toContain('G');
    });
  });

  describe('getSongKey', () => {
    it('should extract the key from a song', () => {
      const result = getSongKey('{key: Am}\n[Am]Test');

      expect(result).toBe('Am');
    });

    it('should return null if no key is set', () => {
      const result = getSongKey('[C]No key defined');

      expect(result).toBeNull();
    });
  });

  describe('getSemitoneDifference', () => {
    it('should return 0 for same key', () => {
      expect(getSemitoneDifference('C', 'C')).toBe(0);
      expect(getSemitoneDifference('G', 'G')).toBe(0);
    });

    it('should calculate positive differences', () => {
      expect(getSemitoneDifference('C', 'D')).toBe(2);
      expect(getSemitoneDifference('C', 'E')).toBe(4);
      expect(getSemitoneDifference('C', 'F')).toBe(5);
    });

    it('should calculate negative differences', () => {
      expect(getSemitoneDifference('D', 'C')).toBe(-2);
      expect(getSemitoneDifference('E', 'C')).toBe(-4);
    });

    it('should handle enharmonic equivalents', () => {
      expect(getSemitoneDifference('C#', 'Db')).toBe(0);
      expect(getSemitoneDifference('F#', 'Gb')).toBe(0);
    });

    it('should wrap around the octave', () => {
      // From C to B is -1, not +11
      expect(getSemitoneDifference('C', 'B')).toBe(-1);
      // From B to C is +1, not -11
      expect(getSemitoneDifference('B', 'C')).toBe(1);
    });

    it('should return 0 for invalid keys', () => {
      expect(getSemitoneDifference('X', 'Y')).toBe(0);
      expect(getSemitoneDifference('C', 'Invalid')).toBe(0);
    });
  });
});
