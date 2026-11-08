/**
 * Minimal chord vocabulary for generated accompaniment: triads and dominant
 * sevenths on any root, e.g. "C", "Dm", "G7", "F#m", "Bb", "Bdim".
 */

const ROOTS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const QUALITIES: Record<string, readonly number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  dim: [0, 3, 6],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
};

export interface Chord {
  readonly symbol: string;
  /** Root pitch class 0–11 (C = 0). */
  readonly root: number;
  /** Pitch classes, root first. */
  readonly pitchClasses: readonly number[];
}

/** Parse a chord symbol; returns null if it is not in the vocabulary. */
export function parseChord(symbol: string): Chord | null {
  const m = /^([A-G])([#b]?)(.*)$/.exec(symbol);
  if (!m) return null;
  const [, letter, accidental, quality] = m;
  const intervals = QUALITIES[quality ?? ''];
  if (!letter || !intervals) return null;
  const root = (ROOTS[letter]! + (accidental === '#' ? 1 : accidental === 'b' ? 11 : 0)) % 12;
  return { symbol, root, pitchClasses: intervals.map((i) => (root + i) % 12) };
}

export function isChordTone(chord: Chord, midi: number): boolean {
  return chord.pitchClasses.includes(((midi % 12) + 12) % 12);
}

/** The chord active at `beat` (chords are sorted [beat, symbol] pairs). */
export function chordAt(chords: readonly (readonly [number, string])[], beat: number): string | null {
  let current: string | null = null;
  for (const [b, c] of chords) {
    if (b > beat + 1e-9) break;
    current = c;
  }
  return current;
}
