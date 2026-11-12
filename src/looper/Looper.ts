import type { LoopInstrument } from './instruments';

/**
 * The Loop Studio's brain: a tempo-locked MIDI looper with 8 loop slots.
 *
 * Everything is in beats on one transport, so loops of different lengths
 * stay in step. You tap a slot to record; recording starts on the next bar
 * (after a one-bar count-in if nothing is playing yet) and closes after the
 * chosen number of bars, or when you tap again ("free" length). The loop
 * then plays back while you add more slots or layers on top.
 *
 * No audio here: `collect(from, to)` returns the notes and metronome clicks
 * due in a time window, and the screen plays them ahead of time on the
 * audio clock. Times are in milliseconds on the same clock as the input
 * events (performance.now()).
 */

export const SLOT_COUNT = 8;
export type LoopLength = 1 | 2 | 4 | 8 | 'free';
/** Snap played notes to this grid, in beats (0 = off, 0.25 = 1/16 notes). */
export type Snap = 0 | 0.25 | 0.5;

export interface LoopNote {
  /** Position in the loop, in beats. */
  beat: number;
  /** Length, in beats. */
  beats: number;
  readonly midi: number;
  /** 1..127 */
  readonly velocity: number;
  readonly instrument: LoopInstrument;
  /** Transport beat when it was played: the live note is heard already, so playback starts on the next pass. */
  pressBeat: number;
}

export type ClipState = 'empty' | 'waiting' | 'recording' | 'playing' | 'muted';

export interface ClipView {
  readonly state: ClipState;
  readonly instrument: LoopInstrument | null;
  /** Bars, once known. */
  readonly bars: number | null;
  /** 0..1 through the loop (or through the recording), when running. */
  readonly position: number | null;
  /** Beats until recording starts (waiting). */
  readonly startsIn: number;
  /** Adding a layer right now. */
  readonly overdubbing: boolean;
  readonly layers: number;
  readonly notes: number;
}

export interface ScheduledNote {
  readonly timeMs: number;
  readonly durationMs: number;
  readonly midi: number;
  readonly velocity: number;
  readonly instrument: LoopInstrument;
  readonly slot: number;
}

export interface ScheduledClick {
  readonly timeMs: number;
  readonly accent: boolean;
}

interface Clip {
  instrument: LoopInstrument;
  /** null while a free-length first recording is still open. */
  lengthBeats: number | null;
  /** Transport beat of the loop's beat 0. */
  anchor: number;
  layers: LoopNote[][];
  muted: boolean;
  /** First recording: from / until (until null = free, still open). Both null once it's done. */
  recFrom: number | null;
  recUntil: number | null;
  /** Adding a layer: until (null when not overdubbing). */
  dubUntil: number | null;
}

export interface LooperSnapshot {
  readonly bpm: number;
  readonly loopBars: LoopLength;
  readonly snap: Snap;
  readonly metronome: boolean;
  readonly slots: ReadonlyArray<{
    readonly instrument: LoopInstrument;
    readonly lengthBeats: number;
    readonly muted: boolean;
    readonly layers: ReadonlyArray<ReadonlyArray<{ beat: number; beats: number; midi: number; velocity: number; instrument: LoopInstrument }>>;
  } | null>;
}

/** A tap this soon after a bar line still counts as "on" that bar (beats). */
const LATE_TAP = 0.5;
/** Notes played this early before recording starts are pulled onto beat 1 (beats). */
const EARLY_NOTE = 0.5;
/** The transport starts this long after the tap that starts it (ms), so the first click isn't late. */
const START_DELAY_MS = 80;

const mod = (a: number, n: number) => ((a % n) + n) % n;

export class Looper {
  bpm = 100;
  readonly beatsPerBar = 4;
  loopBars: LoopLength = 2;
  snap: Snap = 0.25;
  metronome = true;

  private startMs: number | null = null;
  private countInUntil = 0;
  private readonly slots: Array<Clip | null> = Array.from({ length: SLOT_COUNT }, () => null);
  private readonly held = new Map<number, { note: LoopNote; startBeat: number; limit: number }>();

  get running(): boolean {
    return this.startMs !== null;
  }

  get msPerBeat(): number {
    return 60000 / this.bpm;
  }

  beatAt(ms: number): number {
    return this.startMs === null ? 0 : (ms - this.startMs) / this.msPerBeat;
  }

  msAt(beat: number): number {
    return (this.startMs ?? 0) + beat * this.msPerBeat;
  }

  get hasLoops(): boolean {
    return this.slots.some((c) => c && c.lengthBeats !== null && c.recFrom === null);
  }

  /** Start the transport: every finished loop plays from its beginning. */
  start(nowMs: number): void {
    this.startMs = nowMs + START_DELAY_MS;
    this.countInUntil = 0;
    this.rewind(0);
  }

  /** Stop: unfinished first recordings are dropped, layers being added are kept. */
  stop(): void {
    this.startMs = null;
    this.held.clear();
    this.slots.forEach((c, i) => {
      if (!c) return;
      if (c.recFrom !== null) this.slots[i] = null;
      else this.endDub(c);
    });
  }

  /** Change the tempo without jumping: the current beat stays where it is. */
  setBpm(bpm: number, nowMs: number): void {
    const next = Math.max(40, Math.min(220, Math.round(bpm)));
    if (this.startMs !== null) {
      const beat = this.beatAt(nowMs);
      this.bpm = next;
      this.startMs = nowMs - beat * this.msPerBeat;
    } else {
      this.bpm = next;
    }
  }

  /**
   * The one big button per slot: empty → record, recording → finish,
   * playing ↔ muted, waiting → cancel.
   */
  tap(slot: number, nowMs: number, instrument: LoopInstrument): void {
    this.update(nowMs);
    const c = this.slots[slot];
    if (!c) {
      this.arm(slot, nowMs, instrument);
      return;
    }
    const state = this.stateOf(c, this.beatAt(nowMs));
    if (state === 'waiting') this.slots[slot] = null;
    else if (state === 'recording') this.close(c, nowMs);
    else c.muted = !c.muted;
  }

  /** Add a layer to a loop for one pass (tap again to stop early). */
  overdub(slot: number, nowMs: number): void {
    this.update(nowMs);
    const c = this.slots[slot];
    if (!c || c.recFrom !== null || c.lengthBeats === null) return;
    if (!this.running) this.start(nowMs);
    if (c.dubUntil !== null) {
      c.dubUntil = this.beatAt(nowMs);
      this.endDub(c);
      return;
    }
    c.muted = false;
    c.layers.push([]);
    c.dubUntil = this.beatAt(nowMs) + c.lengthBeats;
  }

  /** Remove the last layer (or the whole loop if it only has one). */
  undo(slot: number): void {
    const c = this.slots[slot];
    if (!c) return;
    c.dubUntil = null;
    if (c.layers.length > 1) c.layers.pop();
    else this.slots[slot] = null;
  }

  clear(slot: number): void {
    this.slots[slot] = null;
  }

  clearAll(): void {
    this.slots.fill(null);
    this.held.clear();
  }

  /** A key went down (time in ms on the input clock). Recorded if a slot is recording. */
  noteOn(midi: number, velocity: number, timeMs: number, instrument: LoopInstrument): void {
    if (!this.running) return;
    this.update(timeMs);
    const b = this.beatAt(timeMs);
    const target = this.recordingClip(b);
    if (!target) return;
    const { clip: c, layer } = target;
    let rel = b - c.anchor;
    if (rel < 0) rel = 0; // a touch early for beat 1
    if (this.snap > 0) rel = Math.round(rel / this.snap) * this.snap;
    if (c.lengthBeats !== null) rel = mod(rel, c.lengthBeats);
    const note: LoopNote = { beat: rel, beats: 0.25, midi, velocity, instrument, pressBeat: b };
    c.layers[layer]!.push(note);
    this.held.set(midi, { note, startBeat: b, limit: c.lengthBeats ?? 64 });
  }

  noteOff(midi: number, timeMs: number): void {
    const h = this.held.get(midi);
    if (!h) return;
    this.held.delete(midi);
    h.note.beats = Math.max(0.05, Math.min(h.limit, this.beatAt(timeMs) - h.startBeat));
  }

  /** Move recordings and layers along: call before reading state. */
  update(nowMs: number): void {
    if (!this.running) return;
    const b = this.beatAt(nowMs);
    this.slots.forEach((c, i) => {
      if (!c) return;
      if (c.recFrom !== null && c.recUntil !== null && b >= c.recUntil) {
        c.recFrom = null;
        c.recUntil = null;
        // Nothing played: give the slot back.
        if (c.layers.every((l) => l.length === 0)) this.slots[i] = null;
      }
      if (c.dubUntil !== null && b >= c.dubUntil) this.endDub(c);
    });
  }

  /** Notes and clicks due in [fromMs, toMs). */
  collect(fromMs: number, toMs: number): { notes: ScheduledNote[]; clicks: ScheduledClick[] } {
    const notes: ScheduledNote[] = [];
    const clicks: ScheduledClick[] = [];
    if (!this.running || toMs <= fromMs) return { notes, clicks };
    const fb = this.beatAt(fromMs);
    const tb = this.beatAt(toMs);

    for (let k = Math.max(0, Math.ceil(fb)); k < tb; k++) {
      if (this.metronome || k < this.countInUntil) clicks.push({ timeMs: this.msAt(k), accent: k % this.beatsPerBar === 0 });
    }

    this.slots.forEach((c, slot) => {
      if (!c || c.muted || c.lengthBeats === null) return;
      const L = c.lengthBeats;
      for (const layer of c.layers) {
        for (const n of layer) {
          // The press itself was heard live; play from the next pass on.
          const notBefore = Math.max(fb, n.pressBeat + L / 2);
          let occ = c.anchor + n.beat + Math.ceil((notBefore - c.anchor - n.beat) / L) * L;
          for (; occ < tb; occ += L) {
            notes.push({ timeMs: this.msAt(occ), durationMs: n.beats * this.msPerBeat, midi: n.midi, velocity: n.velocity, instrument: n.instrument, slot });
          }
        }
      }
    });
    notes.sort((a, b) => a.timeMs - b.timeMs);
    return { notes, clicks };
  }

  /** What each slot looks like right now. */
  views(nowMs: number): ClipView[] {
    const b = this.beatAt(nowMs);
    return this.slots.map((c) => {
      if (!c) return { state: 'empty', instrument: null, bars: null, position: null, startsIn: 0, overdubbing: false, layers: 0, notes: 0 };
      const state = this.stateOf(c, b);
      const L = c.lengthBeats;
      let position: number | null = null;
      if (this.running && state !== 'waiting') {
        if (state === 'recording' && c.recUntil === null) position = null;
        else if (L) position = mod(b - c.anchor, L) / L;
      }
      return {
        state,
        instrument: c.instrument,
        bars: L === null ? null : L / this.beatsPerBar,
        position,
        startsIn: state === 'waiting' ? (c.recFrom ?? 0) - b : 0,
        overdubbing: c.dubUntil !== null,
        layers: c.layers.filter((l) => l.length > 0).length,
        notes: c.layers.reduce((n, l) => n + l.length, 0),
      };
    });
  }

  /** Bar and beat (both from 1) for the beat counter; `countIn` during the count-in bar. */
  position(nowMs: number): { bar: number; beat: number; countIn: boolean } | null {
    if (!this.running) return null;
    const b = this.beatAt(nowMs);
    if (b < 0) return { bar: 0, beat: 0, countIn: true };
    const countIn = b < this.countInUntil;
    const fromStart = b - this.countInUntil;
    const bar = countIn ? 0 : Math.floor(fromStart / this.beatsPerBar) + 1;
    return { bar, beat: Math.floor(mod(b, this.beatsPerBar)) + 1, countIn };
  }

  snapshot(): LooperSnapshot {
    return {
      bpm: this.bpm,
      loopBars: this.loopBars,
      snap: this.snap,
      metronome: this.metronome,
      slots: this.slots.map((c) =>
        c && c.lengthBeats !== null && c.recFrom === null
          ? {
              instrument: c.instrument,
              lengthBeats: c.lengthBeats,
              muted: c.muted,
              layers: c.layers
                .filter((l) => l.length > 0)
                .map((l) => l.map(({ beat, beats, midi, velocity, instrument }) => ({ beat, beats, midi, velocity, instrument }))),
            }
          : null,
      ),
    };
  }

  restore(s: Partial<LooperSnapshot>): void {
    if (typeof s.bpm === 'number') this.bpm = Math.max(40, Math.min(220, s.bpm));
    if (s.loopBars !== undefined) this.loopBars = s.loopBars;
    if (s.snap !== undefined) this.snap = s.snap;
    if (typeof s.metronome === 'boolean') this.metronome = s.metronome;
    (s.slots ?? []).slice(0, SLOT_COUNT).forEach((c, i) => {
      if (!c || !(c.lengthBeats > 0) || !c.layers?.length) return;
      this.slots[i] = {
        instrument: c.instrument,
        lengthBeats: c.lengthBeats,
        anchor: 0,
        muted: !!c.muted,
        recFrom: null,
        recUntil: null,
        dubUntil: null,
        layers: c.layers.map((l) => l.map((n) => ({ ...n, pressBeat: -Infinity }))),
      };
    });
  }

  // ---------------------------------------------------------------------------

  private arm(slot: number, nowMs: number, instrument: LoopInstrument): void {
    let anchor: number;
    if (!this.running) {
      // Nothing playing: one bar of count-in clicks, then record (existing loops come in with it).
      this.startMs = nowMs + START_DELAY_MS;
      this.countInUntil = this.beatsPerBar;
      this.rewind(this.beatsPerBar);
      anchor = this.beatsPerBar;
    } else {
      const b = this.beatAt(nowMs);
      const other = this.slots.findIndex((c) => c && c.recFrom !== null);
      const o = other >= 0 ? this.slots[other]! : null;
      if (o && b < o.recFrom!) {
        // Another slot was still waiting: this one takes its place.
        anchor = o.recFrom!;
        this.slots[other] = null;
      } else if (o) {
        // Chain: finish the slot that's recording and start this one right where it ends.
        anchor = this.close(o, nowMs);
      } else {
        anchor = this.nextBar(b);
      }
    }
    const length = this.loopBars === 'free' ? null : this.loopBars * this.beatsPerBar;
    this.slots[slot] = {
      instrument,
      lengthBeats: length,
      anchor,
      layers: [[]],
      muted: false,
      recFrom: anchor,
      recUntil: length === null ? null : anchor + length,
      dubUntil: null,
    };
  }

  /** Finish a first recording on a bar line; returns the beat it ends on. */
  private close(c: Clip, nowMs: number): number {
    const from = c.recFrom!;
    const elapsed = this.beatAt(nowMs) - from;
    let bars = Math.max(1, Math.round(this.nextBar(elapsed) / this.beatsPerBar));
    if (c.lengthBeats !== null) bars = Math.min(bars, c.lengthBeats / this.beatsPerBar);
    const L = bars * this.beatsPerBar;
    c.lengthBeats = L;
    c.recUntil = from + L;
    // Notes past the end (played just after the bar line) wrap to the start.
    for (const layer of c.layers) for (const n of layer) n.beat = mod(n.beat, L);
    for (const h of this.held.values()) h.limit = Math.min(h.limit, L);
    return from + L;
  }

  private endDub(c: Clip): void {
    if (c.dubUntil === null) return;
    c.dubUntil = null;
    if (c.layers.length > 1 && c.layers.at(-1)!.length === 0) c.layers.pop();
  }

  /** The bar line at or after `beat` (a tap just after a bar line counts as that bar). */
  private nextBar(beat: number): number {
    const bar = this.beatsPerBar;
    const floor = Math.floor(beat / bar) * bar;
    return beat - floor < LATE_TAP ? floor : floor + bar;
  }

  private stateOf(c: Clip, b: number): ClipState {
    if (c.recFrom !== null && (c.recUntil === null || b < c.recUntil)) return b < c.recFrom ? 'waiting' : 'recording';
    return c.muted ? 'muted' : 'playing';
  }

  /** The slot (and layer) a note at beat `b` records into, if any. */
  private recordingClip(b: number): { clip: Clip; layer: number } | null {
    // If one recording is ending as the next begins, a note right at the bar line belongs to the new one.
    let first: Clip | null = null;
    for (const c of this.slots) {
      if (c && c.recFrom !== null && b >= c.recFrom - EARLY_NOTE && (c.recUntil === null || b < c.recUntil) && (!first || c.recFrom > first.recFrom!)) first = c;
    }
    if (first) return { clip: first, layer: 0 };
    for (const c of this.slots) {
      if (c && c.dubUntil !== null && c.lengthBeats !== null && b < c.dubUntil && b >= c.dubUntil - c.lengthBeats) return { clip: c, layer: c.layers.length - 1 };
    }
    return null;
  }

  /** Put every finished loop back at its start, at transport beat `beat`. */
  private rewind(beat: number): void {
    for (const c of this.slots) {
      if (!c || c.recFrom !== null) continue;
      c.anchor = beat;
      c.dubUntil = null;
      for (const layer of c.layers) for (const n of layer) n.pressBeat = -Infinity;
    }
  }
}
