import { Emitter } from './Emitter';
import { detectPitch } from './pitch';
import { PitchTracker } from './PitchTracker';
import type { InputStatusEvent, InputStatusListener, PianoEvent, PianoEventListener, PianoInputSource, Unsubscribe } from './types';

export type MicStatus = 'unsupported' | 'off' | 'requesting' | 'listening' | 'denied';

/** Structural subset of navigator.mediaDevices used (injectable for tests). */
export interface MediaDevicesLike {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
}

/**
 * Acoustic-piano input via the microphone (beta, PRD §5.2). Monophonic: one
 * note at a time. Pitch frames are analysed every ~20 ms with YIN and turned
 * into the same PianoEvents MIDI produces, so the engine needs no changes.
 * Timestamps point at the middle of the analysis window (minus the device's
 * input latency when reported); calibration covers the rest.
 */
export class MicrophoneInput implements PianoInputSource {
  readonly kind = 'microphone' as const;
  static readonly DEVICE_ID = 'microphone';

  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private buffer: Float32Array<ArrayBuffer> | null = null;
  private readonly tracker = new PitchTracker({ deviceId: MicrophoneInput.DEVICE_ID, midiRange: [43, 96] });
  private readonly events = new Emitter<PianoEvent>();
  private readonly statusEvents = new Emitter<InputStatusEvent>();
  private readonly changes = new Emitter<void>();
  private _status: MicStatus;
  private _level = 0;
  private _lastNote: number | null = null;

  constructor(private readonly devices: MediaDevicesLike | null = typeof navigator !== 'undefined' && navigator.mediaDevices ? navigator.mediaDevices : null) {
    this._status = devices ? 'off' : 'unsupported';
  }

  get status(): MicStatus {
    return this._status;
  }
  /** Current input level (RMS), for a meter. */
  get level(): number {
    return this._level;
  }
  get lastNote(): number | null {
    return this._lastNote;
  }

  async start(ctx: AudioContext): Promise<boolean> {
    if (!this.devices) return false;
    if (this._status === 'listening') return true;
    this.setStatus('requesting');
    try {
      // Raw signal: browser voice processing would distort piano tones.
      this.stream = await this.devices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch {
      this.setStatus('denied');
      return false;
    }
    this.source = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.source.connect(this.analyser);
    this.buffer = new Float32Array(this.analyser.fftSize);
    const windowMs = (this.analyser.fftSize / ctx.sampleRate) * 1000;
    const inputLatencyMs = ((ctx as AudioContext & { baseLatency?: number }).baseLatency ?? 0) * 1000;
    this.timer = setInterval(() => {
      if (!this.analyser || !this.buffer) return;
      this.analyser.getFloatTimeDomainData(this.buffer);
      const r = detectPitch(this.buffer, ctx.sampleRate);
      this._level = r.rms;
      const time = performance.now() - windowMs / 2 - inputLatencyMs;
      for (const e of this.tracker.process({ time, ...r })) {
        if (e.type === 'noteOn') this._lastNote = e.note;
        this.events.emit(e);
      }
    }, 20);
    this.setStatus('listening');
    this.statusEvents.emit({ type: 'connected', deviceId: MicrophoneInput.DEVICE_ID, deviceName: 'Microphone', time: performance.now() });
    return true;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const e of this.tracker.reset(performance.now())) this.events.emit(e);
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this._level = 0;
    if (this._status === 'listening') this.setStatus('off');
  }

  subscribe(listener: PianoEventListener): Unsubscribe {
    return this.events.on(listener);
  }
  subscribeStatus(listener: InputStatusListener): Unsubscribe {
    return this.statusEvents.on(listener);
  }
  onChange(listener: () => void): Unsubscribe {
    return this.changes.on(listener);
  }

  private setStatus(s: MicStatus): void {
    this._status = s;
    this.changes.emit();
  }
}
