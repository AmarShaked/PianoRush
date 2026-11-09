import { SONG_SCHEMA_VERSION, type BackingStyle, type Hand, type SongDefinition, type SongNote } from '../schema';
import { validateSong } from '../validate';
import type { SmfFile, SmfNote } from './smf';

/*
 * Turn a (licensed) MIDI file into a Piano Rush song: choose the part the
 * player plays, simplify it to something playable, snap it to a grid, fit it
 * to the keyboard, and infer the harmony from the accompaniment so the band
 * can play along. Everything is pure and unit-tested.
 */

const DRUM_CHANNEL = 9;
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

// Krumhansl–Kessler key profiles.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export interface KeyEstimate {
  readonly tonic: number;
  readonly minor: boolean;
  /** Spell accidentals as flats (F, Bb, Eb… major / Dm, Gm, Cm… minor). */
  readonly flats: boolean;
  readonly name: string;
}

/** Estimate the key from duration-weighted pitch classes (Krumhansl–Schmuckler). */
export function estimateKey(notes: readonly { start: number; end: number; midi: number }[]): KeyEstimate {
  const w = new Array<number>(12).fill(0);
  for (const n of notes) w[((n.midi % 12) + 12) % 12]! += Math.max(0.05, n.end - n.start);
  const corr = (profile: number[], tonic: number) => {
    const x = w.map((_, i) => w[(i + tonic) % 12]!);
    const mx = x.reduce((a, b) => a + b, 0) / 12;
    const my = profile.reduce((a, b) => a + b, 0) / 12;
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < 12; i++) {
      num += (x[i]! - mx) * (profile[i]! - my);
      dx += (x[i]! - mx) ** 2;
      dy += (profile[i]! - my) ** 2;
    }
    return dx && dy ? num / Math.sqrt(dx * dy) : 0;
  };
  let best = { tonic: 0, minor: false, score: -Infinity };
  for (let t = 0; t < 12; t++) {
    for (const minor of [false, true]) {
      const score = corr(minor ? MINOR_PROFILE : MAJOR_PROFILE, t);
      if (score > best.score) best = { tonic: t, minor, score };
    }
  }
  // Flat keys: F Bb Eb Ab Db (Gb) major; D G C F Bb (Eb) minor.
  const flatMajor = [5, 10, 3, 8, 1, 6];
  const flatMinor = [2, 7, 0, 5, 10, 3];
  const flats = (best.minor ? flatMinor : flatMajor).includes(best.tonic);
  const name = `${(flats ? FLATS : SHARPS)[best.tonic]}${best.minor ? ' minor' : ' major'}`;
  return { tonic: best.tonic, minor: best.minor, flats, name };
}

export interface TrackSummary {
  readonly index: number;
  readonly name: string;
  readonly noteCount: number;
  readonly low: number;
  readonly high: number;
  readonly meanPitch: number;
  readonly isDrums: boolean;
  /** Share of notes that start together with another note (0 = single line). */
  readonly chordiness: number;
}

export function summarizeTracks(smf: SmfFile): TrackSummary[] {
  return smf.tracks
    .filter((t) => t.notes.length > 0)
    .map((t) => {
      const pitches = t.notes.map((n) => n.midi);
      const starts = new Map<number, number>();
      for (const n of t.notes) starts.set(n.tick, (starts.get(n.tick) ?? 0) + 1);
      const together = t.notes.filter((n) => (starts.get(n.tick) ?? 0) > 1).length;
      return {
        index: t.index,
        name: t.name || `Track ${t.index + 1}`,
        noteCount: t.notes.length,
        low: Math.min(...pitches),
        high: Math.max(...pitches),
        meanPitch: pitches.reduce((a, b) => a + b, 0) / pitches.length,
        isDrums: t.channels.length > 0 && t.channels.every((c) => c === DRUM_CHANNEL),
        chordiness: together / t.notes.length,
      };
    });
}

/** Best guess for the melody: a named melody/vocal/lead track, else the highest single-line track. */
export function suggestMelodyTrack(smf: SmfFile): number | null {
  const tracks = summarizeTracks(smf).filter((t) => !t.isDrums && t.noteCount >= 8);
  if (!tracks.length) return null;
  const named = tracks.find((t) => /melod|vocal|voice|lead|sing|right|rh\b|tune/i.test(t.name));
  if (named) return named.index;
  // High, mostly single-line, and substantial (melodies have many notes).
  const score = (t: TrackSummary) => t.meanPitch - 8 * t.chordiness + 4 * Math.log(t.noteCount);
  return [...tracks].sort((a, b) => score(b) - score(a))[0]!.index;
}

export interface ImportOptions {
  readonly id: string;
  readonly title: string;
  readonly credit: string;
  /** Tracks the player plays. */
  readonly playerTracks: readonly number[];
  /** right / left: one hand plays everything; both: split at middle C. */
  readonly hand: Hand | 'both';
  /** Keep chords (up to 3 notes per hand) instead of a single top line. */
  readonly keepChords?: boolean;
  /** Rhythm grid in beats (0.5 = eighths, 0.25 = sixteenths). */
  readonly grid?: number;
  /** 1-based, inclusive bar range. */
  readonly fromBar?: number;
  readonly toBar?: number;
  /** Semitones, or 'auto' (octave shift into a comfortable range). */
  readonly transpose?: number | 'auto';
  readonly style?: BackingStyle;
  readonly bpm?: number;
  /** Optional recorded backing (licensed recording). */
  readonly audio?: { readonly url: string; readonly offsetMs: number };
}

export interface ImportResult {
  readonly song: SongDefinition;
  readonly warnings: string[];
  readonly stats: { readonly notes: number; readonly lanes: number; readonly bars: number; readonly seconds: number; readonly transpose: number; readonly key: string };
}

interface Beat {
  start: number;
  end: number;
  midi: number;
  hand: Hand;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1]! : 60;
};

/** Infer one chord per window from pitch-class weights (major / minor triads). */
export function inferChords(
  accompaniment: readonly { start: number; end: number; midi: number }[],
  melody: readonly { start: number; end: number; midi: number }[],
  endBeat: number,
  window: number,
  flats = false,
): [number, string][] {
  const NAMES = flats ? FLATS : SHARPS;
  const chords: [number, string][] = [];
  let previous = 'C';
  for (let w = 0; w < endBeat - 1e-9; w += window) {
    const weights = new Array<number>(12).fill(0);
    let bass: number | null = null;
    const add = (list: typeof accompaniment, factor: number) => {
      for (const n of list) {
        const overlap = Math.min(n.end, w + window) - Math.max(n.start, w);
        if (overlap <= 0) continue;
        weights[((n.midi % 12) + 12) % 12]! += overlap * factor;
        if (factor === 1 && (bass === null || n.midi < bass)) bass = n.midi;
      }
    };
    add(accompaniment, 1);
    add(melody, 0.5);
    let best = previous;
    let bestScore = 0;
    for (let root = 0; root < 12; root++) {
      for (const minor of [false, true]) {
        const tones = [root, (root + (minor ? 3 : 4)) % 12, (root + 7) % 12];
        let score = 0;
        weights.forEach((wgt, pc) => (score += tones.includes(pc) ? wgt : -0.6 * wgt));
        if (bass !== null && ((bass as number) % 12) === root) score += 0.25 * window;
        if (score > bestScore + 1e-9) {
          bestScore = score;
          best = `${NAMES[root]}${minor ? 'm' : ''}`;
        }
      }
    }
    if (chords.length === 0 || chords[chords.length - 1]![1] !== best) chords.push([w, best]);
    previous = best;
  }
  if (chords.length === 0) chords.push([0, 'C']);
  chords[0] = [0, chords[0]![1]];
  return chords;
}

export function midiToSong(smf: SmfFile, options: ImportOptions): ImportResult {
  const warnings: string[] = [];
  const tpq = smf.ticksPerQuarter;
  const grid = options.grid ?? 0.5;
  const distinctTempos = new Set(smf.tempos.map((t) => t.usPerQuarter));
  if (distinctTempos.size > 1) warnings.push('The file changes tempo; the first tempo is used for the whole song.');
  const bpm = options.bpm ?? Math.round(60_000_000 / (smf.tempos[0]?.usPerQuarter ?? 500_000));

  const ts = smf.timeSignatures[0];
  let bpb = 4;
  if (ts) {
    const q = (ts.numerator * 4) / ts.denominator;
    if (Number.isInteger(q) && q >= 2 && q <= 6) bpb = q;
    else warnings.push(`Time signature ${ts.numerator}/${ts.denominator} isn't supported yet; using 4/4.`);
  }
  if (smf.timeSignatures.length > 1 && new Set(smf.timeSignatures.map((t) => `${t.numerator}/${t.denominator}`)).size > 1) {
    warnings.push('The file changes time signature; the first one is used.');
  }

  const toBeats = (n: SmfNote) => ({ start: n.tick / tpq, end: (n.tick + n.durationTicks) / tpq, midi: n.midi });
  const tracks = smf.tracks;
  const isDrumNote = (n: SmfNote) => n.channel === DRUM_CHANNEL;
  const player = tracks.filter((t) => options.playerTracks.includes(t.index)).flatMap((t) => t.notes.filter((n) => !isDrumNote(n)).map(toBeats));
  const accomp = tracks.filter((t) => !options.playerTracks.includes(t.index)).flatMap((t) => t.notes.filter((n) => !isDrumNote(n)).map(toBeats));
  if (player.length === 0) throw new Error('The chosen track has no notes.');

  // Bar range (or trim leading silence to the first bar with notes).
  const firstBeat = Math.min(...player.map((n) => n.start));
  const from = options.fromBar ? (options.fromBar - 1) * bpb : Math.floor(firstBeat / bpb + 1e-9) * bpb;
  const to = options.toBar ? options.toBar * bpb : Infinity;
  const clip = <T extends { start: number; end: number }>(list: T[]) =>
    list.filter((n) => n.start >= from - 1e-9 && n.start < to - 1e-9).map((n) => ({ ...n, start: n.start - from, end: Math.min(n.end, to) - from }));

  // Snap to the grid.
  const snap = (x: number) => Math.round(x / grid) * grid;
  let notes: Beat[] = clip(player).map((n) => {
    const start = Math.max(0, snap(n.start));
    return { start, end: Math.max(start + grid, snap(n.end)), midi: n.midi, hand: 'right' as Hand };
  });

  // Transposition: octave shift into a comfortable range (or explicit semitones).
  let transpose = 0;
  if (options.transpose === 'auto' || options.transpose === undefined) {
    // Octave shift that puts the notes best inside a comfortable window for the hand(s).
    const [lo, hi] = options.hand === 'left' ? [48, 60] : options.hand === 'both' ? [48, 72] : [60, 72];
    const pitches = notes.map((n) => n.midi);
    const min = Math.min(...pitches);
    const max = Math.max(...pitches);
    const center = median(pitches);
    let bestCost = Infinity;
    for (let k = -4; k <= 4; k++) {
      const shift = k * 12;
      const cost = Math.max(0, lo - (min + shift)) + Math.max(0, max + shift - hi) + Math.abs(center + shift - (lo + hi) / 2) / 100;
      if (cost < bestCost) (bestCost = cost), (transpose = shift);
    }
  } else {
    transpose = options.transpose;
  }
  notes = notes.map((n) => ({ ...n, midi: n.midi + transpose }));
  for (const n of notes) n.hand = options.hand === 'both' ? (n.midi < 60 ? 'left' : 'right') : options.hand;

  // Simplify: per hand and onset, keep the top note (right hand) / bottom note (left), or up to 3 for chords.
  const byOnset = new Map<string, Beat[]>();
  for (const n of notes) {
    const key = `${n.hand}@${n.start}`;
    byOnset.set(key, [...(byOnset.get(key) ?? []), n]);
  }
  notes = [...byOnset.values()].flatMap((group) => {
    const hand = group[0]!.hand;
    const sorted = [...new Map(group.map((n) => [n.midi, n])).values()].sort((a, b) => (hand === 'right' ? b.midi - a.midi : a.midi - b.midi));
    return sorted.slice(0, options.keepChords ? 3 : 1);
  });

  // Make each hand playable: monophonic lines end where the next note starts; never overlap the same key.
  notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
  if (!options.keepChords) {
    for (const hand of ['left', 'right'] as const) {
      const line = notes.filter((n) => n.hand === hand);
      line.forEach((n, i) => {
        const next = line.find((m, j) => j > i && m.start > n.start + 1e-9);
        if (next && n.end > next.start) n.end = next.start;
      });
    }
  }
  const lastEnd = new Map<number, Beat>();
  for (const n of notes) {
    const prev = lastEnd.get(n.midi);
    if (prev && prev.end > n.start) prev.end = n.start;
    lastEnd.set(n.midi, n);
  }
  notes = notes.filter((n) => n.end - n.start >= grid / 2 - 1e-9);

  const pitches = notes.map((n) => n.midi);
  if (Math.min(...pitches) < 48 || Math.max(...pitches) > 77) {
    warnings.push('Some notes are outside the computer-keyboard range (C3–F5). A MIDI piano can play them all.');
  }
  const lanes = [...new Set(pitches)].sort((a, b) => a - b);
  if (lanes.length > 14) warnings.push(`${lanes.length} different keys — that's a lot of lanes. Try fewer bars, or choose a simpler track.`);

  const endBeat = Math.ceil(Math.max(...notes.map((n) => n.end)) / bpb - 1e-9) * bpb;
  const accompClipped = clip(accomp).map((n) => ({ ...n, midi: n.midi + transpose }));
  // Both lists are already transposed, so the inferred chords are in the played key.
  const key = estimateKey([...accompClipped, ...notes]);
  const lastNoteEnd = Math.max(...notes.map((n) => n.end));
  // No chord changes after the last note: the backing ends with the melody.
  const chords = inferChords(accompClipped, notes, endBeat, bpb === 4 ? 2 : bpb, key.flats).filter(([b], i) => i === 0 || b < lastNoteEnd - 1e-9);
  if (accompClipped.length === 0) warnings.push('No accompaniment track found; chords were guessed from the melody.');

  const songNotes: SongNote[] = notes.map((n) => ({ midi: n.midi, startBeat: n.start, durationBeats: n.end - n.start, hand: n.hand }));
  const song: SongDefinition = {
    schemaVersion: SONG_SCHEMA_VERSION,
    id: options.id,
    title: options.title,
    composer: options.credit,
    bpm,
    timeSignature: [bpb, 4],
    countInBeats: bpb === 3 ? 6 : bpb,
    lanes,
    notes: songNotes,
    holdMinBeats: 1.5,
    preferFlats: key.flats,
    backing: { style: options.style ?? (bpb === 3 ? 'waltz' : 'pop'), chords, ...(options.audio ? { audio: options.audio } : {}) },
  };
  const result = validateSong(song);
  if (!result.valid) throw new Error(`The converted song isn't valid: ${result.errors.slice(0, 3).join('; ')}`);
  const seconds = ((endBeat * 60) / bpm);
  if (seconds > 300) warnings.push('This is longer than 5 minutes; consider importing a section (bar range).');
  return { song, warnings, stats: { notes: songNotes.length, lanes: lanes.length, bars: endBeat / bpb, seconds, transpose, key: key.name } };
}
