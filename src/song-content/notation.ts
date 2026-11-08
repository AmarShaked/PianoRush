import type { SongNote } from './schema';

/**
 * Tiny authoring helper: write a melody as sequential [pitch, beats] steps,
 * where pitch `null` is a rest. Produces beat-positioned SongNotes.
 */
export type Step = readonly [midi: number | null, beats: number];

export function sequence(steps: readonly Step[], startBeat = 0, hand: 'right' | 'left' = 'right'): SongNote[] {
  const notes: SongNote[] = [];
  let beat = startBeat;
  for (const [midi, beats] of steps) {
    if (midi !== null) notes.push({ midi, startBeat: beat, durationBeats: beats, hand });
    beat += beats;
  }
  return notes;
}
