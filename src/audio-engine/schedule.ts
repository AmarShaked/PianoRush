import type { BackingNote } from './arranger';

/** Index of the first note with beat >= `beat` (notes sorted by beat). */
function lowerBound(notes: readonly BackingNote[], beat: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid]!.beat < beat - 1e-9) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Notes starting in [fromBeat, toBeat). Consecutive windows never repeat or skip a note. */
export function notesInWindow(notes: readonly BackingNote[], fromBeat: number, toBeat: number): BackingNote[] {
  const out: BackingNote[] = [];
  for (let i = lowerBound(notes, fromBeat); i < notes.length && notes[i]!.beat < toBeat - 1e-9; i++) out.push(notes[i]!);
  return out;
}

/**
 * Sustained notes (pads, bass) that started before `beat` and are still
 * sounding at it, trimmed to start at `beat`. Used when playback (re)starts
 * mid-chord after a pause or a Discover wait, so harmony is not silent until
 * the next chord change.
 */
export function notesSoundingAt(
  notes: readonly BackingNote[],
  beat: number,
  parts: readonly BackingNote['part'][] = ['pad', 'bass'],
): BackingNote[] {
  const out: BackingNote[] = [];
  for (const n of notes) {
    if (n.beat >= beat - 1e-9) break;
    if (!parts.includes(n.part)) continue;
    const end = n.beat + n.durationBeats;
    if (end > beat + 0.25) out.push({ ...n, beat, durationBeats: end - beat });
  }
  return out;
}
