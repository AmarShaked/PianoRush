import { describe, expect, it } from 'vitest';
import { bassPart, chordPart, fiveFingerFingering, transposeChords, transposeSteps, voicingIn } from './parts';
import { isChordTone, parseChord, transposeChord, chordAt } from './chords';

const CHORDS: [number, string][] = [[0, 'C'], [4, 'F'], [8, 'G7'], [12, 'C']];
const RH = [59, 60, 62, 64, 65, 67, 69]; // B3–A4
const LH = [48, 50, 52, 53, 55]; // C3–G3

function allChordTones(notes: { midi: number; startBeat: number }[], chords: [number, string][]) {
  return notes.every((n) => isChordTone(parseChord(chordAt(chords, n.startBeat)!)!, n.midi));
}
function noSamePitchOverlap(notes: { midi: number; startBeat: number; durationBeats: number }[]) {
  const byPitch = new Map<number, number>();
  for (const n of [...notes].sort((a, b) => a.startBeat - b.startBeat)) {
    if ((byPitch.get(n.midi) ?? -1) > n.startBeat + 1e-9) return false;
    byPitch.set(n.midi, n.startBeat + n.durationBeats);
  }
  return true;
}

describe('transposition', () => {
  it('transposes chord symbols', () => {
    expect(transposeChord('C', 5)).toBe('F');
    expect(transposeChord('G7', 5)).toBe('C7');
    expect(transposeChord('F', 5)).toBe('Bb');
    expect(transposeChord('Am', -12)).toBe('Am');
    expect(transposeChords([[0, 'Em']], 5)).toEqual([[0, 'Am']]);
  });
  it('transposes steps, keeping rests', () => {
    expect(transposeSteps([[60, 1], [null, 1]], -12)).toEqual([[48, 1], [null, 1]]);
  });
});

describe('voicingIn', () => {
  it('picks root-position tones available in the lanes', () => {
    expect(voicingIn('C', RH)).toEqual([60, 64, 67]);
    expect(voicingIn('F', RH)).toEqual([60, 65, 69]);
    expect(voicingIn('G', RH)).toEqual([59, 62, 67]);
    expect(voicingIn('G7', RH)).toEqual([59, 62, 67]);
  });
});

describe('chordPart', () => {
  it.each(['block', 'beats', 'pop', 'broken', 'alberti'] as const)('%s: only chord tones, no same-pitch overlaps', (pattern) => {
    const notes = chordPart(CHORDS, 16, 4, RH, pattern);
    expect(notes.length).toBeGreaterThan(0);
    expect(allChordTones(notes, CHORDS)).toBe(true);
    expect(noSamePitchOverlap(notes)).toBe(true);
  });
  it('block chords are one event of 3 notes per bar', () => {
    const notes = chordPart(CHORDS, 16, 4, RH, 'block');
    expect(notes.filter((n) => n.startBeat === 4).map((n) => n.midi)).toEqual([60, 65, 69]);
  });
  it('alberti: low–high–mid–high eighths', () => {
    expect(chordPart([[0, 'C']], 2, 4, RH, 'alberti').map((n) => n.midi)).toEqual([60, 67, 64, 67]);
  });
});

describe('bassPart', () => {
  it('plays roots in the left-hand lanes, falling back to a chord tone', () => {
    const notes = bassPart([[0, 'C'], [4, 'Am'], [8, 'G7'], [12, 'C']], 16, 4, LH, 'whole');
    expect(notes.map((n) => [n.midi, n.hand])).toEqual([[48, 'left'], [48, 'left'], [55, 'left'], [48, 'left']]);
  });
  it.each(['whole', 'half', 'beats', 'root-fifth'] as const)('%s: chord tones, no overlaps', (p) => {
    const notes = bassPart(CHORDS, 16, 4, LH, p);
    expect(allChordTones(notes, CHORDS)).toBe(true);
    expect(noSamePitchOverlap(notes)).toBe(true);
  });
});

describe('fiveFingerFingering', () => {
  it('right hand: thumb on the base key, one finger per white key', () => {
    expect(fiveFingerFingering([60, 62, 64, 65, 67, 69], 'right', 60)).toEqual([1, 2, 3, 4, 5, null]);
    expect(fiveFingerFingering([67, 69, 71, 72, 74, 66], 'right', 67)).toEqual([1, 2, 3, 4, 5, null]);
  });
  it('left hand: little finger on the base key', () => {
    expect(fiveFingerFingering([48, 50, 52, 53, 55], 'left', 48)).toEqual([5, 4, 3, 2, 1]);
  });
});
