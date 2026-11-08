import type { LevelDefinition } from '../level';
import { bassPart, chordPart, fiveFingerFingering, type BassPattern, type ChordPattern } from '../parts';
import type { BackingSpec, SongDefinition, SongNote } from '../schema';

/*
 * Derivations used by Worlds 4–6. Melodies the player already knows come
 * back in a new role — left hand, accompaniment, or melody + bass — so each
 * of these worlds teaches a coordination skill rather than new tunes.
 */

export const RULES = {
  modes: ['discover', 'flow', 'challenge'] as const,
  completion: { minNoteAccuracy: 0.5 },
  stars: { two: 0.8, three: 0.95 },
};

const lanesOf = (notes: readonly SongNote[]) => [...new Set(notes.map((n) => n.midi))].sort((a, b) => a - b);

/** Five-finger fingering per lane: left hand from C3, right hand from C4. */
export function twoHandFingering(lanes: readonly number[]): (number | null)[] {
  const left = fiveFingerFingering(lanes, 'left', 48);
  const right = fiveFingerFingering(lanes, 'right', 60);
  return lanes.map((m, i) => (m < 60 ? left[i]! : right[i]!));
}

function beatsOf(song: SongDefinition): number {
  return Math.max(...song.notes.map((n) => n.startBeat + n.durationBeats));
}

function endBeatOf(song: SongDefinition): number {
  const bpb = song.timeSignature[0];
  return Math.ceil(beatsOf(song) / bpb - 1e-9) * bpb;
}

/** The same song an octave lower, played by the left hand (C3–G3). */
export function leftHandVersion(source: SongDefinition, id: string, bpm: number, style?: BackingSpec['style']): SongDefinition {
  const notes = source.notes.map((n) => ({ ...n, midi: n.midi - 12, hand: 'left' as const }));
  const lanes = lanesOf(notes);
  return {
    ...source,
    id,
    bpm,
    lanes,
    notes,
    holdMinBeats: 1.5,
    fingers: fiveFingerFingering(lanes, 'left', 48),
    backing: { ...source.backing!, ...(style ? { style } : {}) },
  };
}

/**
 * Right-hand melody plus a left-hand bass part generated from the song's own
 * chords (C3–G3). The band drops its bass so the player's bass isn't doubled.
 */
export function twoHandVersion(
  source: SongDefinition,
  id: string,
  bpm: number,
  bass: BassPattern | 'echo' | 'unison',
  style?: BackingSpec['style'],
): SongDefinition {
  const bpb = source.timeSignature[0];
  const rh = source.notes.map((n) => ({ ...n, hand: 'right' as const }));
  let lh: SongNote[];
  let right = rh;
  if (bass === 'unison') {
    lh = rh.map((n) => ({ ...n, midi: n.midi - 12, hand: 'left' as const }));
  } else if (bass === 'echo') {
    // Call and response: every other 4-bar phrase moves to the left hand.
    const phrase = 4 * bpb;
    const isLeft = (n: SongNote) => Math.floor(n.startBeat / phrase) % 2 === 1;
    right = rh.filter((n) => !isLeft(n));
    lh = rh.filter(isLeft).map((n) => ({ ...n, midi: n.midi - 12, hand: 'left' as const }));
  } else {
    lh = bassPart(source.backing!.chords, endBeatOf(source), bpb, [48, 50, 52, 53, 55], bass);
  }
  const notes = [...lh, ...right];
  const lanes = lanesOf(notes);
  const omit: NonNullable<BackingSpec['omit']> = bass === 'echo' ? [] : ['bass'];
  return {
    ...source,
    id,
    bpm,
    lanes,
    notes,
    holdMinBeats: 1.5,
    fingers: twoHandFingering(lanes),
    backing: { ...source.backing!, ...(style ? { style } : {}), omit },
  };
}

/** Standard right-hand chord voicings in B3–A4 (common beginner inversions). */
export const RH_VOICINGS: Readonly<Record<string, readonly number[]>> = {
  C: [60, 64, 67],
  C7: [60, 64, 67],
  F: [60, 65, 69],
  G: [59, 62, 67],
  G7: [59, 65, 67],
  Am: [60, 64, 69],
  Dm: [62, 65, 69],
  Em: [59, 64, 67],
};

/**
 * Chord City: the player plays the harmony (in a given pattern) while the
 * band plays the tune as a lead melody above.
 */
export function accompanimentVersion(
  source: SongDefinition,
  id: string,
  bpm: number,
  pattern: ChordPattern | ((beat: number) => ChordPattern),
  style?: BackingSpec['style'],
  voicings: Readonly<Record<string, readonly number[]>> = RH_VOICINGS,
): SongDefinition {
  const bpb = source.timeSignature[0];
  const chords = source.backing!.chords;
  const end = endBeatOf(source);
  const lanesAll = [...new Set(Object.values(voicings).flat())];
  let notes: SongNote[];
  if (typeof pattern === 'function') {
    const parts = new Map<ChordPattern, SongNote[]>();
    const partFor = (p: ChordPattern) => {
      if (!parts.has(p)) parts.set(p, chordPart(chords, end, bpb, lanesAll, p, 'right', voicings));
      return parts.get(p)!;
    };
    notes = [];
    for (const p of new Set(Array.from({ length: Math.ceil(end) }, (_, b) => pattern(b)))) {
      notes.push(...partFor(p).filter((n) => pattern(Math.floor(n.startBeat)) === p));
    }
  } else {
    notes = chordPart(chords, end, bpb, lanesAll, pattern, 'right', voicings);
  }
  const lanes = lanesOf(notes);
  return {
    ...source,
    id,
    title: `${source.title} (chords)`,
    bpm,
    lanes,
    notes,
    holdMinBeats: 1.5,
    fingers: undefined,
    assist: undefined,
    backing: { ...source.backing!, ...(style ? { style } : {}), lead: source.notes, omit: ['pad', 'keys'] },
  };
}

export function derivedLevel(world: number, number: number, title: string, objective: string, hand: 'left' | 'right', song: SongDefinition): LevelDefinition {
  return { id: song.id, world, number, title, objective, hand, song, ...RULES };
}
