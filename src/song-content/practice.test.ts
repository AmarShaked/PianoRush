import { describe, expect, it } from 'vitest';
import { findPhrases, repeatedPatterns, sliceSong } from './practice';
import { compileSong, validateSong, WORLD_1, WORLD_5 } from './index';

describe('practice tools', () => {
  const memory = WORLD_1.levels[8]!.song; // Echo Valley: A A B B

  it('splits a song into labelled 4-bar phrases', () => {
    const phrases = findPhrases(memory);
    expect(phrases.map((p) => p.label)).toEqual(['A', 'A', 'B']);
    expect(phrases.map((p) => [p.firstBar, p.lastBar])).toEqual([[1, 4], [5, 8], [9, 12]]);
  });

  it('detects repeated patterns, also with 2-bar phrases', () => {
    expect(repeatedPatterns(memory)).toEqual([{ label: 'A', occurrences: [0, 1] }]);
    const two = repeatedPatterns(memory, 2);
    expect(two.map((p) => p.occurrences.length)).toContain(2);
  });

  it('finds the 4× repeated phrase in Au Clair de la Lune', () => {
    expect(repeatedPatterns(WORLD_1.levels[2]!.song)).toEqual([{ label: 'A', occurrences: [0, 1, 2, 3] }]);
  });

  it('slices a section, loops it, and keeps it valid with matching harmony', () => {
    const song = WORLD_1.levels[9]!.song; // Starlight Steps
    const s = sliceSong(song, 32, 48, 3);
    expect(validateSong(s)).toEqual({ valid: true, errors: [] });
    const c = compileSong(s);
    expect(c.totalBeats).toBeLessThanOrEqual(48);
    const per = song.notes.filter((n) => n.startBeat >= 32 && n.startBeat < 48).length;
    expect(c.notes).toHaveLength(per * 3);
    expect(s.backing!.chords[0]).toEqual([0, 'C']);
    expect(s.backing!.chords.filter(([b]) => b === 16 || b === 32)).toHaveLength(2);
    expect(s.assist).toBeUndefined();
  });

  it('carries the band lead along when slicing a Chord City level', () => {
    const s = sliceSong(WORLD_5.levels[7]!.song, 0, 16, 2);
    expect(s.backing!.lead!.length).toBeGreaterThan(0);
    expect(Math.max(...s.backing!.lead!.map((n) => n.startBeat))).toBeLessThan(32);
  });
});
