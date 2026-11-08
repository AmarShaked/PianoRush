import { describe, expect, it } from 'vitest';
import { compileSong, SongValidationError, starlightSteps, validateSong, sequence, SONGS, type SongDefinition } from './index';

describe('Starlight Steps (M1 test song)', () => {
  const compiled = compileSong(starlightSteps);

  it('is valid', () => {
    expect(validateSong(starlightSteps)).toEqual({ valid: true, errors: [] });
  });

  it('lasts 30–45 seconds', () => {
    expect(compiled.endMs / 1000).toBeGreaterThanOrEqual(30);
    expect(compiled.endMs / 1000).toBeLessThanOrEqual(45);
  });

  it('uses only the five lane pitches C4 D4 E4 F4 G4, all of them', () => {
    expect(starlightSteps.lanes).toEqual([60, 62, 64, 65, 67]);
    expect(new Set(compiled.notes.map((n) => n.midi))).toEqual(new Set([60, 62, 64, 65, 67]));
  });

  it('starts and ends on the tonic (C)', () => {
    expect(compiled.notes[0]?.midi).toBe(60);
    expect(compiled.notes.at(-1)?.midi).toBe(60);
  });

  it('fills whole 4/4 bars (phrases line up with the bar grid)', () => {
    expect(compiled.totalBeats).toBe(63); // 16 bars with the final note held for 3 beats
  });

  it('converts beats to ms using the BPM', () => {
    expect(compiled.msPerBeat).toBe(600);
    expect(compiled.countInMs).toBe(2400);
    expect(compiled.notes[2]).toMatchObject({ startBeat: 2, timeMs: 1200, durationMs: 1200, lane: 4 });
  });

  it('is registered in the catalog', () => {
    expect(SONGS).toContain(starlightSteps);
  });
});

describe('song validation', () => {
  const base: SongDefinition = {
    schemaVersion: 1, id: 'x', title: 'X', composer: 'c', bpm: 100, timeSignature: [4, 4], countInBeats: 4,
    lanes: [60, 62], notes: sequence([[60, 1], [62, 1]]),
  };

  it.each([
    ['bpm', { bpm: 0 }],
    ['unmapped pitch', { notes: [{ midi: 61, startBeat: 0, durationBeats: 1 }] }],
    ['negative beat', { notes: [{ midi: 60, startBeat: -1, durationBeats: 1 }] }],
    ['zero duration', { notes: [{ midi: 60, startBeat: 0, durationBeats: 0 }] }],
    ['same-pitch overlap', { notes: [{ midi: 60, startBeat: 0, durationBeats: 2 }, { midi: 60, startBeat: 1, durationBeats: 1 }] }],
    ['duplicate lane', { lanes: [60, 60] }],
    ['no notes', { notes: [] }],
    ['schema version', { schemaVersion: 2 }],
    ['time signature', { timeSignature: [4, 3] }],
  ] as const)('rejects invalid %s', (_, patch) => {
    const song = { ...base, ...patch } as unknown as SongDefinition;
    expect(validateSong(song).valid).toBe(false);
    expect(() => compileSong(song)).toThrow(SongValidationError);
  });

  it('sequence() places rests as gaps', () => {
    expect(sequence([[60, 1], [null, 1], [62, 2]]).map((n) => [n.midi, n.startBeat, n.durationBeats])).toEqual([
      [60, 0, 1], [62, 2, 2],
    ]);
  });
});
