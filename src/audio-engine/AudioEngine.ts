import type { BackingNote } from './arranger';
import { ClockSync } from './ClockSync';
import { bass, clap, click, crash, hat, keys, kick, lead, openHat, pad, piano, snare, synthBass, type Voice } from './synth';

export interface Volumes {
  /** 0..1 */
  readonly backing: number;
  readonly piano: number;
  readonly metronome: number;
}

export interface LatencyInfo {
  /** Processing latency of the context (s). */
  readonly base: number;
  /** Device-reported output latency (s), or null if the browser doesn't report it. */
  readonly output: number | null;
}

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  const w = globalThis as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Owns the AudioContext: mixer buses (backing / piano / metronome → master →
 * limiter), the clock mapping to gameplay time, the built-in piano, and
 * precise scheduling of accompaniment notes. Has no knowledge of game rules.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses!: Record<keyof Volumes, GainNode>;
  private analyser!: AnalyserNode;
  private readonly sync = new ClockSync();
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private readonly backingVoices = new Set<Voice>();
  private readonly pianoVoices = new Map<number, Voice>();
  private volumes: Volumes = { backing: 0.8, piano: 0.9, metronome: 0.6 };
  /** Count of notes scheduled since creation (diagnostics / tests). */
  scheduledCount = 0;

  static get isSupported(): boolean {
    return audioContextCtor() !== null;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  get isRunning(): boolean {
    return this.ctx?.state === 'running';
  }

  /**
   * Create / resume the AudioContext. Call from a user gesture (click / key):
   * browsers keep audio suspended until then.
   */
  unlock(): boolean {
    const Ctor = audioContextCtor();
    if (!Ctor) return false;
    if (!this.ctx) {
      const ctx = new Ctor({ latencyHint: 'interactive' });
      this.ctx = ctx;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.ratio.value = 8;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.master = ctx.createGain();
      this.master.connect(limiter).connect(this.analyser).connect(ctx.destination);
      const bus = () => {
        const g = ctx.createGain();
        g.connect(this.master);
        return g;
      };
      this.buses = { backing: bus(), piano: bus(), metronome: bus() };
      this.applyVolumes();
      this.syncTimer = setInterval(() => this.updateSync(), 100);
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
    this.updateSync();
    return true;
  }

  /** Unlock and wait until the context is actually running. */
  async ready(): Promise<boolean> {
    if (!this.unlock() || !this.ctx) return false;
    try {
      await this.ctx.resume();
    } catch {
      return false;
    }
    this.updateSync();
    return this.isRunning;
  }

  setVolumes(volumes: Partial<Volumes>): void {
    this.volumes = { ...this.volumes, ...volumes };
    if (this.ctx) this.applyVolumes();
  }

  get latency(): LatencyInfo | null {
    if (!this.ctx) return null;
    const output = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency;
    return { base: this.ctx.baseLatency ?? 0, output: typeof output === 'number' && output > 0 ? output : null };
  }

  /** Total latency used to size the scheduling lookahead (s). */
  get totalLatency(): number {
    const l = this.latency;
    return (l?.base ?? 0) + (l?.output ?? 0);
  }

  /** Context time at which a sound must start to be heard at gameplay time `perfMs`. */
  contextTimeFor(perfMs: number): number {
    if (!this.ctx) throw new Error('Audio not unlocked');
    if (!this.sync.isSynced) this.updateSync(); // otherwise the 100 ms timer keeps the mapping fresh
    return this.sync.isSynced ? this.sync.toContextTime(perfMs) : this.ctx.currentTime + (perfMs - performance.now()) / 1000;
  }

  /** Schedule one accompaniment note at context time `when` lasting `durationSec`. */
  playBacking(note: BackingNote, when: number, durationSec: number, maxLateSec = 0.03): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = Math.max(when, ctx.currentTime);
    if (when < ctx.currentTime - maxLateSec) return; // too late to be in time: drop rather than smear
    const out = note.part === 'click' ? this.buses.metronome : this.buses.backing;
    const v = note.velocity;
    let voice: Voice;
    switch (note.part) {
      case 'kick':
        voice = kick(ctx, out, t, v);
        break;
      case 'snare':
        voice = snare(ctx, out, t, v);
        break;
      case 'hat':
        voice = hat(ctx, out, t, v);
        break;
      case 'clap':
        voice = clap(ctx, out, t, v);
        break;
      case 'openhat':
        voice = openHat(ctx, out, t, v);
        break;
      case 'crash':
        voice = crash(ctx, out, t, v);
        break;
      case 'synthbass':
        voice = synthBass(ctx, out, t, note.midi ?? 36, durationSec, v);
        break;
      case 'bass':
        voice = bass(ctx, out, t, note.midi ?? 36, durationSec, v);
        break;
      case 'pad':
        voice = pad(ctx, out, t, note.midi ?? 48, durationSec, v);
        break;
      case 'keys':
        voice = keys(ctx, out, t, note.midi ?? 48, durationSec, v);
        break;
      case 'lead':
        voice = lead(ctx, out, t, note.midi ?? 72, durationSec, v);
        break;
      case 'click':
        voice = click(ctx, out, t, note.accent ?? false, v);
        break;
    }
    this.track(voice);
    this.scheduledCount++;
  }

  /** A soft held chord (Discover mode while waiting). Returns a stop function. */
  sustainChord(midis: readonly number[], level = 0.18): () => void {
    const ctx = this.ctx;
    if (!ctx) return () => undefined;
    const t = ctx.currentTime + 0.02;
    const voices = midis.map((m) => pad(ctx, this.buses.backing, t, m, 600, level));
    voices.forEach((v) => this.track(v));
    return () => voices.forEach((v) => v.stop(ctx.currentTime, 0.25));
  }

  /** Stop all scheduled / sounding accompaniment (pause, wait, restart, quit). */
  stopBacking(fadeSec = 0.08): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const v of this.backingVoices) v.stop(ctx.currentTime, fadeSec);
    this.backingVoices.clear();
  }

  pianoNoteOn(midi: number, velocity: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this.pianoVoices.get(midi)?.stop(ctx.currentTime, 0.03);
    this.pianoVoices.set(midi, piano(ctx, this.buses.piano, ctx.currentTime, midi, velocity));
  }

  pianoNoteOff(midi: number): void {
    const ctx = this.ctx;
    const v = this.pianoVoices.get(midi);
    if (!ctx || !v) return;
    v.stop(ctx.currentTime, 0.18);
    this.pianoVoices.delete(midi);
  }

  pianoAllOff(): void {
    for (const midi of [...this.pianoVoices.keys()]) this.pianoNoteOff(midi);
  }

  /** Current output level (RMS, 0..1) — for diagnostics and automated checks. */
  outputLevel(): number {
    if (!this.ctx) return 0;
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (const x of data) sum += x * x;
    return Math.sqrt(sum / data.length);
  }

  dispose(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.backingVoices.clear();
    this.pianoVoices.clear();
  }

  private track(voice: Voice): void {
    this.backingVoices.add(voice);
    // Forget it once it has finished on its own.
    const ms = Math.max(0, (voice.end - (this.ctx?.currentTime ?? 0)) * 1000) + 200;
    setTimeout(() => this.backingVoices.delete(voice), ms);
  }

  private applyVolumes(): void {
    const curve = (v: number) => Math.max(0, Math.min(1, v)) ** 2; // perceptual-ish
    // Mix: the player's piano sits on top; the accompaniment supports it.
    this.buses.backing.gain.value = curve(this.volumes.backing) * 0.45;
    this.buses.piano.gain.value = curve(this.volumes.piano);
    this.buses.metronome.gain.value = curve(this.volumes.metronome) * 0.7;
    this.master.gain.value = 0.9;
  }

  private updateSync(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
    if (ts && (ts.contextTime ?? 0) > 0 && (ts.performanceTime ?? 0) > 0) {
      this.sync.update(ts.contextTime!, ts.performanceTime!);
    } else {
      this.sync.updateFromCurrentTime(ctx.currentTime, performance.now(), this.totalLatency);
    }
  }
}
