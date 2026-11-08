const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** Scientific pitch notation, e.g. 60 → "C4". */
export function midiToNoteName(midi: number): string {
  const name = NAMES[((midi % 12) + 12) % 12] ?? '?';
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

/** Pitch class only, e.g. 61 → "C#". */
export function midiToPitchClass(midi: number): string {
  return NAMES[((midi % 12) + 12) % 12] ?? '?';
}

export function isBlackKey(midi: number): boolean {
  const pc = ((midi % 12) + 12) % 12;
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}

export const MIDDLE_C = 60;
