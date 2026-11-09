import type { Voice } from './synth';
import { chooseSample, findOnset, layersByPreference, LOAD_ORDER, sampleFile, SAMPLED_PITCHES, type SampleLayer } from './sampler';

export type SampledPianoStatus = 'idle' | 'loading' | 'ready' | 'error';

interface LoadedSample {
  readonly buffer: AudioBuffer;
  /** Seconds of leading silence / decoder padding to skip. */
  readonly onset: number;
}

/** Overall level, matched by ear and RMS to the synth piano so switching sounds don't jump in volume. */
const LEVEL = 1.4;
const CONCURRENCY = 6;

/**
 * The sampled grand piano (Salamander Grand Piano V3 by Alexander Holm,
 * CC BY 3.0). Samples are downloaded on first use, most-used velocity layer
 * first, and cached by the service worker for offline play. Until a note's
 * samples are in, `voice` returns null and the caller uses the synth piano.
 */
export class SampledPiano {
  private readonly samples = new Map<string, LoadedSample>();
  private readonly listeners = new Set<() => void>();
  private loading: Promise<void> | null = null;
  private _status: SampledPianoStatus = 'idle';
  private failed = 0;
  readonly total = SAMPLED_PITCHES.length * LOAD_ORDER.length;

  constructor(
    private readonly baseUrl = 'samples/salamander/',
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  get status(): SampledPianoStatus {
    return this._status;
  }

  /** Samples decoded so far. */
  get loaded(): number {
    return this.samples.size;
  }

  /** 0..1 */
  get progress(): number {
    return (this.samples.size + this.failed) / this.total;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Start (or join) the download. Resolves when every file has loaded or failed. */
  load(ctx: BaseAudioContext): Promise<void> {
    if (this.loading) return this.loading;
    this.failed = 0;
    this.setStatus('loading');
    const queue = LOAD_ORDER.flatMap((layer) => SAMPLED_PITCHES.map((pitch) => ({ pitch, layer })));
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        try {
          const res = await this.fetchFn(this.baseUrl + sampleFile(job.pitch, job.layer));
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
          this.samples.set(key(job.pitch, job.layer), { buffer, onset: findOnset(buffer.getChannelData(0), buffer.sampleRate) });
        } catch {
          this.failed++;
        }
        this.emit();
      }
    };
    this.loading = Promise.all(Array.from({ length: CONCURRENCY }, worker)).then(() => {
      // Usable if at least one full layer made it; otherwise fall back to the synth (and allow a retry).
      const complete = SAMPLED_PITCHES.every((p) => LOAD_ORDER.some((l) => this.samples.has(key(p, l))));
      this.setStatus(complete ? 'ready' : 'error');
      if (!complete) this.loading = null;
    });
    return this.loading;
  }

  /** Resolve when loading finishes or after `timeoutMs`, whichever is first. */
  async whenLoaded(ctx: BaseAudioContext, timeoutMs: number): Promise<void> {
    await Promise.race([this.load(ctx), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  }

  /** A piano note at context time `t`, or null if its samples aren't loaded (use the synth). */
  voice(ctx: BaseAudioContext, out: AudioNode, t: number, midi: number, velocity127: number): Voice | null {
    const sample = chooseSample(midi, velocity127);
    let loaded: LoadedSample | undefined;
    let layer: SampleLayer = sample.layer;
    for (const l of layersByPreference(velocity127)) {
      loaded = this.samples.get(key(sample.pitch, l));
      if (loaded) {
        layer = l;
        break;
      }
    }
    if (!loaded) return null;
    const { rate, gain } = layer === sample.layer ? sample : chooseSample(midi, velocity127, layer);

    const g = ctx.createGain();
    g.gain.value = gain * LEVEL;
    g.connect(out);
    const src = ctx.createBufferSource();
    src.buffer = loaded.buffer;
    src.playbackRate.value = rate;
    src.connect(g);
    src.start(t, loaded.onset);
    const end = t + (loaded.buffer.duration - loaded.onset) / rate;
    return {
      end,
      stop(at, fadeSec = 0.06) {
        try {
          // The dampers come down: a short fade, like releasing the key.
          g.gain.cancelScheduledValues(at);
          g.gain.setTargetAtTime(0, at, Math.max(0.005, fadeSec / 3));
          src.stop(Math.min(end, at + fadeSec + 0.1));
        } catch {
          /* already stopped */
        }
      },
    };
  }

  private setStatus(status: SampledPianoStatus): void {
    this._status = status;
    this.emit();
  }

  private emit(): void {
    for (const l of [...this.listeners]) l();
  }
}

const key = (pitch: number, layer: SampleLayer) => `${pitch}v${layer}`;
