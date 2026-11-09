import { Emitter } from './Emitter';
import { HeldNotesTracker } from './HeldNotesTracker';
import { parseMidiMessage, parseSustainPedal } from './midiMessage';
import type { InputStatusEvent, InputStatusListener, PedalEvent, PedalListener, PianoEvent, PianoEventListener, PianoInputSource, Unsubscribe } from './types';

/**
 * Bridge for native app wrappers (PRD §13: "iOS MIDI support must not rely on
 * Safari Web MIDI availability").
 *
 * A wrapper app (e.g. a WKWebView with CoreMIDI on iOS/iPadOS, or an Android
 * WebView with android.media.midi) calls into the page:
 *
 *   window.PianoRushNative.midi([0x90, 60, 100], ageMs, deviceId, deviceName)
 *   window.PianoRushNative.device(deviceId, deviceName, connected)
 *
 * `ageMs` is how long ago the message was received natively (native clocks
 * don't share the page's time origin, so the bridge converts "age" into the
 * page's performance.now() time base). Messages are parsed and filtered by the
 * same code as Web MIDI, so behaviour is identical.
 */
export interface NativeBridgeApi {
  midi(bytes: readonly number[], ageMs?: number, deviceId?: string, deviceName?: string): void;
  device(deviceId: string, deviceName: string, connected: boolean): void;
  readonly version: number;
}

export class NativeMidiBridge implements PianoInputSource {
  readonly kind = 'native-midi' as const;
  static readonly VERSION = 1;

  private readonly tracker = new HeldNotesTracker();
  private readonly events = new Emitter<PianoEvent>();
  private readonly statusEvents = new Emitter<InputStatusEvent>();
  private readonly pedalEvents = new Emitter<PedalEvent>();
  /** Devices whose sustain pedal is down. */
  private readonly pedalsDown = new Set<string>();
  private readonly changes = new Emitter<void>();
  private readonly devices = new Map<string, string>();
  private _active = false;

  constructor(private readonly now: () => number = () => performance.now()) {}

  /** True once a native host has sent anything. */
  get isActive(): boolean {
    return this._active;
  }

  get deviceNames(): string[] {
    return [...this.devices.values()];
  }

  /** The API object a native host calls. */
  readonly api: NativeBridgeApi = {
    version: NativeMidiBridge.VERSION,
    midi: (bytes, ageMs = 0, deviceId = 'native', deviceName) => {
      this.markActive(deviceId, deviceName ?? this.devices.get(deviceId) ?? 'Native MIDI');
      const time = this.now() - Math.max(0, Math.min(1000, ageMs));
      const pedal = parseSustainPedal(bytes, time, deviceId, 'native-midi');
      if (pedal) return this.setPedal(pedal);
      const event = parseMidiMessage(bytes, time, deviceId, 'native-midi');
      if (!event) return;
      const accepted = this.tracker.process(event);
      if (accepted) this.events.emit(accepted);
    },
    device: (deviceId, deviceName, connected) => {
      if (connected) {
        this.markActive(deviceId, deviceName);
        this.statusEvents.emit({ type: 'connected', deviceId, deviceName, time: this.now() });
      } else {
        this.devices.delete(deviceId);
        for (const release of this.tracker.releaseAll(this.now())) if (release.deviceId === deviceId) this.events.emit(release);
        this.setPedal({ type: 'sustain', down: false, time: this.now(), source: 'native-midi', deviceId });
        this.statusEvents.emit({ type: 'disconnected', deviceId, deviceName, time: this.now() });
        this.changes.emit();
      }
    },
  };

  /** Expose the API as `window.PianoRushNative` (and tell an iOS host we're ready, if present). */
  install(target: Record<string, unknown> = globalThis as unknown as Record<string, unknown>): void {
    target.PianoRushNative = this.api;
    const webkit = target.webkit as { messageHandlers?: { pianoRush?: { postMessage(m: unknown): void } } } | undefined;
    webkit?.messageHandlers?.pianoRush?.postMessage({ type: 'ready', version: NativeMidiBridge.VERSION });
  }

  subscribe(listener: PianoEventListener): Unsubscribe {
    return this.events.on(listener);
  }
  subscribeStatus(listener: InputStatusListener): Unsubscribe {
    return this.statusEvents.on(listener);
  }
  subscribePedal(listener: PedalListener): Unsubscribe {
    return this.pedalEvents.on(listener);
  }
  onChange(listener: () => void): Unsubscribe {
    return this.changes.on(listener);
  }

  private setPedal(pedal: PedalEvent): void {
    if (pedal.down === this.pedalsDown.has(pedal.deviceId)) return;
    if (pedal.down) this.pedalsDown.add(pedal.deviceId);
    else this.pedalsDown.delete(pedal.deviceId);
    this.pedalEvents.emit(pedal);
  }

  private markActive(deviceId: string, deviceName: string): void {
    const known = this.devices.has(deviceId);
    this.devices.set(deviceId, deviceName);
    if (!this._active || !known) {
      this._active = true;
      this.changes.emit();
    }
  }
}
