const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/** Scientific pitch notation, e.g. 60 → "C4" (70 → "A#4", or "Bb4" with preferFlats). */
export function midiToNoteName(midi: number, preferFlats = false): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${midiToPitchClass(midi, preferFlats)}${octave}`;
}

/** Pitch class only, e.g. 61 → "C#" (or "Db"). */
export function midiToPitchClass(midi: number, preferFlats = false): string {
  return (preferFlats ? FLAT_NAMES : NAMES)[((midi % 12) + 12) % 12] ?? '?';
}

export function isBlackKey(midi: number): boolean {
  const pc = ((midi % 12) + 12) % 12;
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}

export const MIDDLE_C = 60;
