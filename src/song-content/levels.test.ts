import { describe, expect, it } from 'vitest';
import { chordAt, compileSong, isChordTone, parseChord, validateSong, WORLD_1 } from './index';

const levels = WORLD_1.levels;

describe('World 1 levels', () => {
  it('has the ten PRD levels in order', () => {
    expect(levels.map((l) => l.title)).toEqual([
      'First Note', 'Up & Down', 'Three Steps', 'Little Melody', 'Five Fingers',
      'Hold It', 'Jump!', 'Rhythm Run', 'Memory Challenge', 'First Concert',
    ]);
    expect(levels.map((l) => l.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(levels.map((l) => l.id)).size).toBe(10);
    expect(new Set(levels.map((l) => l.song.id)).size).toBe(10);
  });

  it.each(levels.map((l) => [l.title, l] as const))('%s is a valid song of 30–60 s', (_, level) => {
    expect(validateSong(level.song)).toEqual({ valid: true, errors: [] });
    const song = compileSong(level.song);
    const seconds = song.endMs / 1000;
    expect(seconds).toBeGreaterThanOrEqual(30);
    expect(seconds).toBeLessThanOrEqual(60);
  });

  it.each(levels.map((l) => [l.title, l] as const))('%s uses every lane, starts and ends on C', (_, level) => {
    const song = compileSong(level.song);
    expect(new Set(song.notes.map((n) => n.midi))).toEqual(new Set(level.song.lanes));
    expect(song.notes[0]?.midi).toBe(60);
    expect(song.notes.at(-1)?.midi).toBe(60);
  });

  it('levels 1–5 add exactly one key each, contiguous white keys from middle C', () => {
    const white = [60, 62, 64, 65, 67];
    levels.slice(0, 5).forEach((l, i) => expect(l.song.lanes).toEqual(white.slice(0, i + 1)));
  });

  it('introduces hold notes in level 6, not before', () => {
    const holds = levels.map((l) => compileSong(l.song).holdCount);
    expect(holds.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(holds[5]).toBeGreaterThan(5);
  });

  it('introduces eighth notes no earlier than Rhythm Run (except the final concert)', () => {
    const hasEighths = (i: number) => levels[i]!.song.notes.some((n) => n.durationBeats < 1);
    for (let i = 0; i < 7; i++) expect(hasEighths(i)).toBe(false);
    expect(hasEighths(7)).toBe(true);
  });

  it('the memory level fades exactly the repeated phrases', () => {
    const song = compileSong(levels[8]!.song);
    const faded = song.notes.filter((n) => n.assistFade);
    expect(faded.length).toBeGreaterThan(0);
    expect(faded.every((n) => (n.startBeat >= 16 && n.startBeat < 32) || (n.startBeat >= 40 && n.startBeat < 48))).toBe(true);
    // The faded repeat is the same melody as the visible first statement.
    const first = song.notes.filter((n) => n.startBeat < 16).map((n) => [n.midi, n.durationBeats]);
    const repeat = song.notes.filter((n) => n.startBeat >= 16 && n.startBeat < 32).map((n) => [n.midi, n.durationBeats]);
    expect(repeat).toEqual(first);
  });

  it('every level offers all three modes and sane thresholds', () => {
    for (const l of levels) {
      expect(l.modes).toEqual(['discover', 'flow', 'challenge']);
      expect(l.completion.minNoteAccuracy).toBeLessThan(l.stars.two);
      expect(l.stars.two).toBeLessThan(l.stars.three);
    }
  });
});

describe('song compilation: events and holds', () => {
  it('groups notes that start together into one chord event', () => {
    const song = compileSong({
      schemaVersion: 1, id: 'c', title: 'c', composer: 'c', bpm: 120, timeSignature: [4, 4], countInBeats: 4,
      lanes: [60, 64, 67],
      notes: [
        { midi: 67, startBeat: 0, durationBeats: 1 },
        { midi: 60, startBeat: 0, durationBeats: 1 },
        { midi: 64, startBeat: 1, durationBeats: 2 },
      ],
    });
    expect(song.events.map((e) => e.noteIds.length)).toEqual([2, 1]);
    expect(song.notes.map((n) => [n.midi, n.eventId, n.isHold])).toEqual([[60, 0, false], [67, 0, false], [64, 1, true]]);
    expect(song.holdCount).toBe(1);
  });
});

describe('World 1 accompaniment', () => {
  it.each(levels.map((l) => [l.title, l] as const))('%s has a valid backing that covers the whole song', (_, level) => {
    const song = compileSong(level.song);
    expect(level.song.backing).toBeDefined();
    const chords = level.song.backing!.chords;
    expect(chords[0]![0]).toBe(0);
    expect(chords.at(-1)![0]).toBeLessThan(song.totalBeats);
  });

  /*
   * Consonance rule: every melody note that starts on a strong beat (beat 1 or 3
   * of the bar) or lasts two beats or more must be a tone of the chord that is
   * sounding, for its whole length. Passing notes on weak beats are free.
   */
  it.each(levels.map((l) => [l.title, l] as const))('%s: strong-beat and long melody notes are chord tones', (_, level) => {
    const chords = level.song.backing!.chords;
    const clashes: string[] = [];
    for (const n of level.song.notes) {
      const strong = Math.abs(n.startBeat % 2) < 1e-9;
      if (!strong && n.durationBeats < 2) continue;
      // Check at the start and at every chord change while the note sounds.
      const checkpoints = [n.startBeat, ...chords.map(([b]) => b).filter((b) => b > n.startBeat && b < n.startBeat + n.durationBeats)];
      for (const beat of checkpoints) {
        const symbol = chordAt(chords, beat)!;
        if (!isChordTone(parseChord(symbol)!, n.midi)) clashes.push(`beat ${beat}: ${n.midi} over ${symbol}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('ends every level on a C major chord', () => {
    for (const l of levels) expect(l.song.backing!.chords.at(-1)![1]).toBe('C');
  });
});

describe('chord vocabulary', () => {
  it.each([
    ['C', [0, 4, 7]],
    ['Dm', [2, 5, 9]],
    ['G7', [7, 11, 2, 5]],
    ['F#m', [6, 9, 1]],
    ['Bb', [10, 2, 5]],
    ['Bdim', [11, 2, 5]],
  ] as const)('%s → %j', (symbol, pcs) => {
    expect(parseChord(symbol)?.pitchClasses).toEqual(pcs);
  });

  it('rejects unknown symbols', () => {
    expect(parseChord('H')).toBeNull();
    expect(parseChord('Cfoo')).toBeNull();
  });
});
