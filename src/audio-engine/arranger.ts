import { chordAt, parseChord, type Chord } from '../song-content/chords';
import type { CompiledSong } from '../song-content/compile';
import type { BackingStyle } from '../song-content/schema';

export type BackingPart = 'kick' | 'snare' | 'clap' | 'hat' | 'openhat' | 'crash' | 'bass' | 'synthbass' | 'pad' | 'keys' | 'lead' | 'click';

/** One accompaniment event in musical time. Pitched parts carry a MIDI note. */
export interface BackingNote {
  readonly part: BackingPart;
  readonly beat: number;
  readonly durationBeats: number;
  /** 0..1 */
  readonly velocity: number;
  readonly midi?: number;
  /** Metronome downbeat. */
  readonly accent?: boolean;
}

export interface ArrangeOptions {
  /** Click on every beat of the song (the count-in always clicks). */
  readonly metronome?: boolean;
}

/** Highest MIDI note of the default accompaniment register (just below middle C). */
export const ACCOMPANIMENT_CEILING = 59;

/**
 * Registers the band uses for a song, chosen so no pitched backing part ever
 * enters the range of the player's lanes (the band never doubles the player):
 *  - chords (pads / keys) in C3–B3 when the player is above it, otherwise in
 *    the first free octave above the player;
 *  - bass in C2–B2, or an octave lower if the player plays down there.
 */
export interface Registers {
  readonly chordBase: number;
  readonly bassBase: number;
  /** Lowest MIDI note the player uses. */
  readonly playerLow: number;
  readonly playerHigh: number;
}

export function registersFor(lanes: readonly number[]): Registers {
  const lo = Math.min(...lanes);
  const hi = Math.max(...lanes);
  let chordBase = 48;
  while (!(chordBase + 11 < lo || chordBase > hi)) chordBase += 12;
  const bassBase = lo > 47 ? 36 : 24;
  return { chordBase, bassBase, playerLow: lo, playerHigh: hi };
}

/** Close-position chord voicing in one octave starting at `base` (C3–B3 by default). */
export function padVoicing(chord: Chord, base = 48): number[] {
  return chord.pitchClasses.map((pc) => base + pc).sort((a, b) => a - b);
}

export function bassRoot(chord: Chord, base = 36): number {
  return base + chord.root;
}

/**
 * Generate the accompaniment for a song from its `backing` spec: drums, bass,
 * pads/keys and clicks. Pure and deterministic. The melody is never included,
 * and every pitched part stays below middle C, so it can't double the player.
 */
export function arrange(song: CompiledSong, options: ArrangeOptions = {}): BackingNote[] {
  const def = song.definition;
  const bpb = def.timeSignature[0];
  const out: BackingNote[] = [];

  // Count-in clicks (always), accent on the bar start.
  for (let b = -def.countInBeats; b < 0; b++) {
    out.push({ part: 'click', beat: b, durationBeats: 0.1, velocity: 1, accent: (b + def.countInBeats) % bpb === 0 });
  }

  const endBeat = Math.ceil(song.totalBeats / bpb - 1e-9) * bpb;
  if (options.metronome) {
    for (let b = 0; b < endBeat; b++) out.push({ part: 'click', beat: b, durationBeats: 0.1, velocity: 0.7, accent: b % bpb === 0 });
  }

  const spec = def.backing;
  if (!spec) return sortNotes(out);

  const reg = registersFor(def.lanes);
  const omit = new Set(spec.omit ?? []);
  const chords = spec.chords;
  const chordOf = (beat: number): Chord => parseChord(chordAt(chords, beat) ?? 'C') ?? parseChord('C')!;
  const lastStart = song.notes[song.notes.length - 1]?.startBeat ?? 0;
  const endingStart = Math.floor(lastStart / bpb + 1e-9) * bpb;

  // Lead melody (the band plays the tune while the player accompanies), placed above the player.
  if (spec.lead?.length) {
    const leadLow = Math.min(...spec.lead.map((n) => n.midi));
    let shift = 0;
    while (leadLow + shift <= reg.playerHigh) shift += 12;
    for (const n of spec.lead) out.push({ part: 'lead', beat: n.startBeat, durationBeats: n.durationBeats, velocity: 0.55, midi: n.midi + shift });
  }

  // Pads: one sustained voicing per chord segment (styles that use pads).
  if (spec.style !== 'gentle' && !omit.has('pad') && !spec.lead?.length) {
    const level = spec.style === 'groove' ? 0.16 : spec.style === 'dance' ? 0.14 : 0.2;
    chords.forEach(([start, symbol], i) => {
      const end = Math.min(chords[i + 1]?.[0] ?? endBeat, endingStart);
      if (start >= end) return;
      for (const midi of padVoicing(parseChord(symbol)!, reg.chordBase)) out.push({ part: 'pad', beat: start, durationBeats: end - start, velocity: level, midi });
    });
  }

  const energetic = spec.style === 'pop' || spec.style === 'dance' || spec.style === 'waltz';
  for (let bar = 0; bar * bpb < endingStart; bar++) {
    if (energetic && bar % 4 === 0) out.push({ part: 'crash', beat: bar * bpb, durationBeats: 2, velocity: bar === 0 ? 0.7 : 0.5 });
    // Fill on the last beat of every 4-bar phrase (and before the ending): a rising snare roll.
    const fillBar = (bar % 4 === 3 || (bar + 1) * bpb >= endingStart) && energetic && spec.style !== 'waltz';
    if (fillBar) {
      for (let k = 0; k < 4; k++) out.push({ part: 'snare', beat: bar * bpb + bpb - 1 + k * 0.25, durationBeats: 0.25, velocity: 0.35 + k * 0.12 });
    }
    for (let pos = 0; pos < bpb; pos++) {
      const beat = bar * bpb + pos;
      const changed = chords.some(([b]) => b === beat) && pos !== 0;
      pattern(spec.style, out, beat, pos, bpb, chordOf, changed, reg);
    }
  }

  // Ending: one hit and the final chord held to the end of the bar.
  const finalChord = chordOf(endingStart);
  const len = endBeat - endingStart;
  out.push({ part: 'kick', beat: endingStart, durationBeats: 0.5, velocity: 0.9 });
  if (spec.style === 'pop' || spec.style === 'dance') out.push({ part: 'crash', beat: endingStart, durationBeats: 4, velocity: 0.8 });
  out.push({ part: 'bass', beat: endingStart, durationBeats: len, velocity: 0.75, midi: bassRoot(finalChord, reg.bassBase) });
  if (!spec.lead?.length) {
    for (const midi of padVoicing(finalChord, reg.chordBase)) out.push({ part: 'pad', beat: endingStart, durationBeats: len, velocity: 0.28, midi });
  }

  // Parts the player covers are left out entirely.
  const dropped = (n: BackingNote) =>
    (omit.has('bass') && (n.part === 'bass' || n.part === 'synthbass')) || (omit.has('keys') && n.part === 'keys') || (omit.has('pad') && n.part === 'pad');
  return sortNotes(out.filter((n) => !dropped(n)));
}

function pattern(
  style: BackingStyle,
  out: BackingNote[],
  beat: number,
  pos: number,
  bpb: number,
  chordOf: (beat: number) => Chord,
  chordChangedHere: boolean,
  reg: Registers,
): void {
  const chord = chordOf(beat);
  const root = bassRoot(chord, reg.bassBase);
  const fifth = root + 7 < reg.playerLow ? root + 7 : root - 5;
  const octaveUp = (m: number) => (m + 12 < reg.playerLow ? m + 12 : m);
  const voicing = (c: Chord) => padVoicing(c, reg.chordBase);
  const mid = Math.floor(bpb / 2);
  const push = (n: BackingNote) => out.push(n);

  if (style === 'gentle') {
    if (pos === 0) push({ part: 'kick', beat, durationBeats: 0.5, velocity: 0.5 });
    push({ part: 'hat', beat, durationBeats: 0.25, velocity: 0.14 });
    if (pos === 0 || pos === mid || chordChangedHere) {
      const len = pos === 0 && !chordChangedHere ? mid : bpb - pos;
      push({ part: 'bass', beat, durationBeats: Math.min(len, nextChangeDistance(chordOf, beat, pos === 0 ? mid : bpb - pos)), velocity: 0.6, midi: pos === mid && !chordChangedAt(chordOf, beat) ? fifth : root });
    }
    // Broken-chord arpeggio: root, third, fifth, third.
    const v = voicing(chord);
    const idx = [0, 1, 2, 1][pos % 4] ?? 0;
    push({ part: 'keys', beat, durationBeats: 1, velocity: 0.32, midi: v[Math.min(idx, v.length - 1)] });
    return;
  }

  if (style === 'straight') {
    if (pos % 2 === 0) push({ part: 'kick', beat, durationBeats: 0.5, velocity: 0.8 });
    else push({ part: 'snare', beat, durationBeats: 0.5, velocity: 0.55 });
    push({ part: 'hat', beat, durationBeats: 0.25, velocity: 0.24 });
    push({ part: 'hat', beat: beat + 0.5, durationBeats: 0.25, velocity: 0.14 });
    const note = pos === mid && !chordChangedAt(chordOf, beat) ? fifth : root;
    push({ part: 'bass', beat, durationBeats: 0.9, velocity: 0.65, midi: note });
    return;
  }

  if (style === 'waltz') {
    // Oom-pah-pah: bass + kick on the downbeat, chord on the other beats, light crash per phrase.
    if (pos === 0) {
      push({ part: 'kick', beat, durationBeats: 0.5, velocity: 0.7 });
      const barIndex = Math.floor(beat / bpb);
      push({ part: 'bass', beat, durationBeats: 0.95, velocity: 0.7, midi: barIndex % 2 && !chordChangedAt(chordOf, beat) ? fifth : root });
    } else {
      for (const midi of voicing(chord)) push({ part: 'keys', beat, durationBeats: 0.6, velocity: 0.26, midi });
    }
    push({ part: 'hat', beat, durationBeats: 0.25, velocity: pos === 0 ? 0.2 : 0.12 });
    return;
  }

  if (style === 'dance') {
    // House: four-on-the-floor kick, claps on 2 & 4, open hats on the off-beats,
    // off-beat synth bass and syncopated chord stabs.
    push({ part: 'kick', beat, durationBeats: 0.5, velocity: 0.9 });
    if (pos % 2 === 1) push({ part: 'clap', beat, durationBeats: 0.5, velocity: 0.7 });
    push({ part: 'hat', beat, durationBeats: 0.25, velocity: 0.12 });
    push({ part: 'openhat', beat: beat + 0.5, durationBeats: 0.5, velocity: 0.32 });
    const offChord = chordOf(beat + 0.5);
    const offRoot = bassRoot(offChord, reg.bassBase);
    push({ part: 'synthbass', beat: beat + 0.5, durationBeats: 0.42, velocity: 0.75, midi: pos === bpb - 1 ? octaveUp(offRoot) : offRoot });
    if (pos === 1 || pos === 3) {
      for (const midi of voicing(chordOf(beat + 0.5))) push({ part: 'keys', beat: beat + 0.5, durationBeats: 0.3, velocity: 0.28, midi });
    }
    return;
  }

  if (style === 'pop') {
    // Pop/rock: kick 1, "and" of 2, 3; claps on 2 & 4; eighth hats; driving eighth-note bass.
    if (pos === 0 || pos === mid) push({ part: 'kick', beat, durationBeats: 0.5, velocity: 0.85 });
    if (pos === 1) push({ part: 'kick', beat: beat + 0.5, durationBeats: 0.5, velocity: 0.6 });
    if (pos % 2 === 1) {
      push({ part: 'clap', beat, durationBeats: 0.5, velocity: 0.55 });
      push({ part: 'snare', beat, durationBeats: 0.5, velocity: 0.45 });
    }
    push({ part: 'hat', beat, durationBeats: 0.25, velocity: 0.22 });
    push({ part: 'hat', beat: beat + 0.5, durationBeats: 0.25, velocity: 0.15 });
    for (const off of [0, 0.5]) {
      const c = chordOf(beat + off);
      push({ part: 'bass', beat: beat + off, durationBeats: 0.45, velocity: off ? 0.5 : 0.65, midi: bassRoot(c, reg.bassBase) });
    }
    return;
  }

  // groove
  if (pos === 0) push({ part: 'kick', beat, durationBeats: 0.5, velocity: 0.85 });
  if (pos === 1) push({ part: 'kick', beat: beat + 0.5, durationBeats: 0.5, velocity: 0.55 });
  if (pos === mid) push({ part: 'kick', beat, durationBeats: 0.5, velocity: 0.8 });
  if (pos % 2 === 1) push({ part: 'snare', beat, durationBeats: 0.5, velocity: 0.65 });
  push({ part: 'hat', beat, durationBeats: 0.25, velocity: 0.14 });
  push({ part: 'hat', beat: beat + 0.5, durationBeats: 0.25, velocity: 0.26 });
  const groove: Record<number, [offset: number, dur: number, which: 'root' | 'fifth' | 'octave']> = {
    0: [0, 1.5, 'root'],
    2: [0, 1, 'fifth'],
    3: [0, 0.5, 'octave'],
  };
  const g = chordChangedHere ? ([0, 1, 'root'] as const) : groove[pos];
  if (g) {
    const midi = g[2] === 'root' ? root : g[2] === 'fifth' ? fifth : octaveUp(root);
    push({ part: 'bass', beat: beat + g[0], durationBeats: g[1], velocity: 0.7, midi });
  }
  if (pos === 1) push({ part: 'bass', beat: beat + 0.5, durationBeats: 0.5, velocity: 0.55, midi: root });
  if (pos === 0 || pos === mid) {
    // Off-beat chord stabs.
    for (const midi of voicing(chordOf(beat + 0.5))) push({ part: 'keys', beat: beat + 0.5, durationBeats: 0.4, velocity: 0.3, midi });
  }
}

function chordChangedAt(chordOf: (beat: number) => Chord, beat: number): boolean {
  return chordOf(beat).symbol !== chordOf(beat - 1).symbol;
}

function nextChangeDistance(chordOf: (beat: number) => Chord, beat: number, max: number): number {
  const symbol = chordOf(beat).symbol;
  for (let d = 1; d < max; d++) if (chordOf(beat + d).symbol !== symbol) return d;
  return max;
}

function sortNotes(notes: BackingNote[]): BackingNote[] {
  return notes.sort((a, b) => a.beat - b.beat);
}
