import { frequencyToMidi } from './pitch';
import type { PianoEvent } from './types';

export interface PitchFrame {
  /** Gameplay-clock time (ms) the frame represents. */
  readonly time: number;
  readonly frequency: number | null;
  readonly clarity: number;
  readonly rms: number;
}

export interface PitchTrackerOptions {
  /** Minimum clarity to trust a pitch. */
  readonly minClarity?: number;
  /** Level needed to start a note. */
  readonly onsetRms?: number;
  /** A sounding note ends when the level falls below this fraction of its peak. */
  readonly releaseRatio?: number;
  /** Frames a new pitch must persist before it counts (debounce). */
  readonly stableFrames?: number;
  /** A sudden level jump by this factor on the same pitch is a re-strike. */
  readonly restrikeRatio?: number;
  readonly midiRange?: readonly [number, number];
  readonly deviceId?: string;
}

/**
 * Turns a stream of pitch frames into note-on / note-off PianoEvents
 * (monophonic). Handles onsets, decays, pitch changes, and repeated notes on
 * the same key (detected as a sudden rise in level). Pure and frame-rate
 * independent apart from `stableFrames`.
 */
export class PitchTracker {
  private readonly o: Required<PitchTrackerOptions>;
  private active: { midi: number; peak: number; startedAt: number } | null = null;
  private candidate: { midi: number; count: number; firstTime: number; firstRms: number } | null = null;
  private lastRms = 0;

  constructor(options: PitchTrackerOptions = {}) {
    this.o = {
      minClarity: 0.8,
      onsetRms: 0.012,
      releaseRatio: 0.18,
      stableFrames: 2,
      restrikeRatio: 1.8,
      midiRange: [36, 96],
      deviceId: 'microphone',
      ...options,
    };
  }

  get activeNote(): number | null {
    return this.active?.midi ?? null;
  }

  process(frame: PitchFrame): PianoEvent[] {
    const out: PianoEvent[] = [];
    const { minClarity, onsetRms, releaseRatio, stableFrames, restrikeRatio, midiRange } = this.o;
    const midi =
      frame.frequency !== null && frame.clarity >= minClarity ? Math.round(frequencyToMidi(frame.frequency)) : null;
    const inRange = midi !== null && midi >= midiRange[0] && midi <= midiRange[1];
    const rising = this.lastRms > 0 && frame.rms > this.lastRms * restrikeRatio && frame.rms > onsetRms;
    this.lastRms = frame.rms;

    if (this.active) {
      const a = this.active;
      a.peak = Math.max(a.peak, frame.rms);
      const decayed = frame.rms < a.peak * releaseRatio || frame.rms < onsetRms * 0.5;
      const restrike = rising && inRange && midi === a.midi && frame.time - a.startedAt > 60;
      const changed = inRange && midi !== a.midi && frame.rms >= onsetRms;
      if (decayed || restrike) {
        out.push(this.off(a.midi, frame.time));
        this.active = null;
        if (restrike) {
          out.push(this.on(a.midi, frame.time, frame.rms));
          this.active = { midi: a.midi, peak: frame.rms, startedAt: frame.time };
        }
        this.candidate = null;
        return out;
      }
      if (changed) {
        if (this.candidate?.midi === midi) this.candidate.count++;
        else this.candidate = { midi: midi!, count: 1, firstTime: frame.time, firstRms: frame.rms };
        if (this.candidate.count >= stableFrames) {
          out.push(this.off(a.midi, this.candidate.firstTime));
          out.push(this.on(midi!, this.candidate.firstTime, this.candidate.firstRms));
          this.active = { midi: midi!, peak: frame.rms, startedAt: this.candidate.firstTime };
          this.candidate = null;
        }
      } else {
        this.candidate = null;
      }
      return out;
    }

    if (!inRange || frame.rms < onsetRms) {
      this.candidate = null;
      return out;
    }
    if (this.candidate?.midi === midi) this.candidate.count++;
    else this.candidate = { midi: midi!, count: 1, firstTime: frame.time, firstRms: frame.rms };
    if (this.candidate.count >= stableFrames) {
      out.push(this.on(midi!, this.candidate.firstTime, Math.max(this.candidate.firstRms, frame.rms)));
      this.active = { midi: midi!, peak: frame.rms, startedAt: this.candidate.firstTime };
      this.candidate = null;
    }
    return out;
  }

  /** Release whatever is sounding (mic stopped). */
  reset(time: number): PianoEvent[] {
    const out = this.active ? [this.off(this.active.midi, time)] : [];
    this.active = null;
    this.candidate = null;
    return out;
  }

  private on(note: number, time: number, rms: number): PianoEvent {
    const velocity = Math.max(1, Math.min(127, Math.round(20 + Math.sqrt(rms) * 400)));
    return { type: 'noteOn', note, velocity, time, channel: 0, source: 'microphone', deviceId: this.o.deviceId };
  }

  private off(note: number, time: number): PianoEvent {
    return { type: 'noteOff', note, velocity: 0, time, channel: 0, source: 'microphone', deviceId: this.o.deviceId };
  }
}
