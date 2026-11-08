import { chordAt, parseChord, transposeChord } from './chords';
import type { Step } from './notation';
import type { BackingSpec, Hand, SongNote } from './schema';

type Chords = BackingSpec['chords'];

/*
 * Part generators. Accompaniment and bass parts are derived from a chord
 * progression, so they are chord tones by construction (the consonance rule
 * holds automatically) and the same progression drives the band.
 */

/** Shift every pitch of a step list. */
export function transposeSteps(steps: readonly Step[], semitones: number): Step[] {
  return steps.map(([m, b]) => [m === null ? null : m + semitones, b] as Step);
}

export function transposeChords(chords: Chords, semitones: number): [number, string][] {
  return chords.map(([b, c]) => [b, transposeChord(c, semitones)]);
}

/** Notes from steps, with a hand tag and a start offset. */
export function notesFromSteps(steps: readonly Step[], hand: Hand, startBeat = 0): SongNote[] {
  const out: SongNote[] = [];
  let beat = startBeat;
  for (const [midi, beats] of steps) {
    if (midi !== null) out.push({ midi, startBeat: beat, durationBeats: beats, hand });
    beat += beats;
  }
  return out;
}

/** Chord segments [start, end) clipped to the song length, split at bar lines when `perBar`. */
export function chordSegments(chords: Chords, endBeat: number, beatsPerBar: number, perBar = true): { start: number; end: number; symbol: string }[] {
  const segs: { start: number; end: number; symbol: string }[] = [];
  chords.forEach(([start, symbol], i) => {
    const end = Math.min(chords[i + 1]?.[0] ?? endBeat, endBeat);
    let s = start;
    while (s < end) {
      const barEnd = perBar ? (Math.floor(s / beatsPerBar + 1e-9) + 1) * beatsPerBar : end;
      const e = Math.min(end, barEnd);
      segs.push({ start: s, end: e, symbol });
      s = e;
    }
  });
  return segs;
}

/** Choose, for each chord, the pitches available in `lanes` that belong to it. */
export function voicingIn(symbol: string, lanes: readonly number[], max = 3): number[] {
  const chord = parseChord(symbol);
  if (!chord) throw new Error(`Unknown chord ${symbol}`);
  const tones = lanes.filter((m) => chord.pitchClasses.includes(((m % 12) + 12) % 12));
  // Prefer the root, then the third, then the fifth, then anything else; keep it compact.
  const rank = (m: number) => chord.pitchClasses.indexOf(((m % 12) + 12) % 12);
  const unique = new Map<number, number>();
  for (const m of tones.sort((a, b) => rank(a) - rank(b) || a - b)) if (!unique.has(m % 12)) unique.set(m % 12, m);
  return [...unique.values()].slice(0, max).sort((a, b) => a - b);
}

export type ChordPattern =
  /** One block chord per segment (per bar). */
  | 'block'
  /** Block chord on every beat. */
  | 'beats'
  /** Block chords on 1, the "and" of 2, and 4 (pop rhythm). */
  | 'pop'
  /** Broken chord: one tone per beat, low–mid–high–mid. */
  | 'broken'
  /** Alberti bass: eighths low–high–mid–high. */
  | 'alberti';

/**
 * Generate a chord-playing part from a progression. Every note is a chord tone
 * of the chord sounding at that moment; same-pitch notes never overlap.
 */
export function chordPart(
  chords: Chords,
  endBeat: number,
  beatsPerBar: number,
  lanes: readonly number[],
  pattern: ChordPattern,
  hand: Hand = 'right',
  voicings: Readonly<Record<string, readonly number[]>> = {},
): SongNote[] {
  const out: SongNote[] = [];
  const voice = (symbol: string) => [...(voicings[symbol] ?? voicingIn(symbol, lanes))];
  const block = (notes: number[], start: number, dur: number) => {
    for (const midi of notes) out.push({ midi, startBeat: start, durationBeats: dur, hand });
  };
  for (const seg of chordSegments(chords, endBeat, beatsPerBar)) {
    const v = voice(seg.symbol);
    const len = seg.end - seg.start;
    switch (pattern) {
      case 'block':
        block(v, seg.start, len);
        break;
      case 'beats':
        for (let b = seg.start; b < seg.end - 1e-9; b++) block(v, b, Math.min(1, seg.end - b) * 0.95);
        break;
      case 'pop': {
        const offs = len >= beatsPerBar ? [0, 1.5, 3] : [0, len >= 2 ? 1 : null].filter((x): x is number => x !== null);
        offs.forEach((o, i) => {
          const next = offs[i + 1] ?? len;
          block(v, seg.start + o, (next - o) * 0.95);
        });
        break;
      }
      case 'broken': {
        const order = v.length >= 3 ? [v[0]!, v[1]!, v[2]!, v[1]!] : [v[0]!, v[v.length - 1]!];
        for (let b = seg.start, i = 0; b < seg.end - 1e-9; b++, i++) {
          out.push({ midi: order[i % order.length]!, startBeat: b, durationBeats: Math.min(1, seg.end - b) * 0.95, hand });
        }
        break;
      }
      case 'alberti': {
        const [lo, mid, hi] = v.length >= 3 ? [v[0]!, v[1]!, v[2]!] : [v[0]!, v[0]!, v[v.length - 1]!];
        const order = [lo, hi, mid, hi];
        for (let b = seg.start, i = 0; b < seg.end - 1e-9; b += 0.5, i++) {
          out.push({ midi: order[i % 4]!, startBeat: b, durationBeats: 0.45, hand });
        }
        break;
      }
    }
  }
  return out;
}

export type BassPattern = 'whole' | 'half' | 'beats' | 'waltz' | 'root-fifth';

/**
 * A left-hand bass part from a progression, using only `lanes` (e.g. C3–G3).
 * Roots when available; otherwise the nearest available chord tone.
 */
export function bassPart(chords: Chords, endBeat: number, beatsPerBar: number, lanes: readonly number[], pattern: BassPattern): SongNote[] {
  const out: SongNote[] = [];
  for (const seg of chordSegments(chords, endBeat, beatsPerBar)) {
    const chord = parseChord(seg.symbol)!;
    const tones = lanes.filter((m) => chord.pitchClasses.includes(m % 12));
    const root = tones.find((m) => m % 12 === chord.root) ?? tones[0];
    const fifth = tones.find((m) => m % 12 === (chord.root + 7) % 12) ?? tones.find((m) => m !== root) ?? root;
    if (root === undefined) throw new Error(`No chord tone of ${seg.symbol} in lanes`);
    const len = seg.end - seg.start;
    const push = (midi: number, start: number, dur: number) => out.push({ midi, startBeat: start, durationBeats: dur, hand: 'left' });
    if (pattern === 'whole' || len < 2) push(root, seg.start, len * 0.97);
    else if (pattern === 'half') for (let b = seg.start; b < seg.end - 1e-9; b += 2) push(root, b, Math.min(2, seg.end - b) * 0.95);
    else if (pattern === 'beats') for (let b = seg.start; b < seg.end - 1e-9; b++) push(root, b, 0.9);
    else if (pattern === 'waltz') push(root, seg.start, len * 0.97);
    else for (let b = seg.start, i = 0; b < seg.end - 1e-9; b += 2, i++) push(i % 2 ? fifth! : root, b, Math.min(2, seg.end - b) * 0.95);
  }
  return out;
}

/** The chord sounding at a beat (re-export for authoring). */
export { chordAt };

const WHITE = new Set([0, 2, 4, 5, 7, 9, 11]);
function whiteStepsBetween(from: number, to: number): number {
  let n = 0;
  for (let m = from + 1; m <= to; m++) if (WHITE.has(m % 12)) n++;
  return n;
}

/**
 * Five-finger fingering for a hand position. Right hand: thumb (1) on `base`,
 * one finger per white key upward. Left hand: little finger (5) on `base`.
 * Lanes outside the five-key position (or black keys) get null.
 */
export function fiveFingerFingering(lanes: readonly number[], hand: Hand, base: number): (number | null)[] {
  return lanes.map((m) => {
    if (m < base || !WHITE.has(m % 12)) return null;
    const step = whiteStepsBetween(base, m);
    if (step > 4) return null;
    return hand === 'right' ? step + 1 : 5 - step;
  });
}
