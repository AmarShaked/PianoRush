import { Emitter } from './Emitter';
import { HeldNotesTracker } from './HeldNotesTracker';
import { parseMidiMessage } from './midiMessage';
import type {
  InputStatusEvent,
  InputStatusListener,
  PianoEvent,
  PianoEventListener,
  PianoInputSource,
  Unsubscribe,
} from './types';

/*
 * Structural subsets of the Web MIDI API. Using these instead of the DOM
 * classes directly keeps the manager testable with plain fake objects and
 * leaves room for non-browser (native) MIDI bridges with the same shape.
 */
export interface MidiMessageEventLike {
  readonly data: Uint8Array | null;
  readonly timeStamp: number;
}
export interface MidiInputLike {
  readonly id: string;
  readonly name: string | null;
  readonly manufacturer: string | null;
  readonly state: string; // 'connected' | 'disconnected'
  readonly type: string; // 'input' | 'output'
  addEventListener(type: 'midimessage', listener: (e: MidiMessageEventLike) => void): void;
  removeEventListener(type: 'midimessage', listener: (e: MidiMessageEventLike) => void): void;
}
export interface MidiConnectionEventLike {
  readonly port: { readonly id: string; readonly type: string; readonly state: string; readonly name: string | null } | null;
}
export interface MidiAccessLike {
  readonly inputs: { forEach(cb: (input: MidiInputLike) => void): void; get(id: string): MidiInputLike | undefined };
  addEventListener(type: 'statechange', listener: (e: MidiConnectionEventLike) => void): void;
  removeEventListener(type: 'statechange', listener: (e: MidiConnectionEventLike) => void): void;
}
export type RequestMidiAccess = (options?: { sysex?: boolean }) => Promise<MidiAccessLike>;

export interface MidiDeviceInfo {
  readonly id: string;
  readonly name: string;
  readonly manufacturer: string;
  readonly connected: boolean;
}

export type MidiAccessStatus = 'unsupported' | 'idle' | 'requesting' | 'granted' | 'denied';

export interface WebMidiManagerOptions {
  /** Defaults to `navigator.requestMIDIAccess` when available. */
  requestMIDIAccess?: RequestMidiAccess | null;
  /** Monotonic clock, defaults to performance.now(). */
  now?: () => number;
}

/** Feature-detect Web MIDI without touching it (safe on Safari / SSR). */
export function detectWebMidi(nav: unknown = globalThis.navigator): RequestMidiAccess | null {
  if (!nav || typeof nav !== 'object') return null;
  const fn = (nav as { requestMIDIAccess?: unknown }).requestMIDIAccess;
  if (typeof fn !== 'function') return null;
  return (options) => (fn as (o?: unknown) => Promise<MidiAccessLike>).call(nav, options);
}

/** Tolerate implementations that report 0 or a different time origin. */
function normalizeTimestamp(ts: number, now: number): number {
  if (!Number.isFinite(ts) || ts <= 0 || Math.abs(now - ts) > 1000) return now;
  return ts;
}

/**
 * Owns the Web MIDI connection: access request, device listing, input
 * selection, hot-plug handling and event normalization.
 *
 * Emits normalized, de-duplicated PianoEvents from the *selected* input only.
 * When the selected device disconnects, synthetic noteOffs are emitted for
 * every held key and a status event is broadcast; if the same device comes
 * back it is re-attached automatically.
 */
export class WebMidiManager implements PianoInputSource {
  readonly kind = 'midi' as const;

  private readonly request: RequestMidiAccess | null;
  private readonly now: () => number;
  private access: MidiAccessLike | null = null;
  private status: MidiAccessStatus;
  private errorMessage: string | null = null;

  private selectedId: string | null = null;
  private attachedInput: MidiInputLike | null = null;
  private readonly tracker = new HeldNotesTracker();

  private readonly events = new Emitter<PianoEvent>();
  private readonly rawEvents = new Emitter<PianoEvent>();
  private readonly statusEvents = new Emitter<InputStatusEvent>();
  private readonly changes = new Emitter<void>();
  private disposed = false;

  constructor(options: WebMidiManagerOptions = {}) {
    this.request = options.requestMIDIAccess === undefined ? detectWebMidi() : options.requestMIDIAccess;
    this.now = options.now ?? (() => performance.now());
    this.status = this.request ? 'idle' : 'unsupported';
  }

  get isSupported(): boolean {
    return this.request !== null;
  }
  get accessStatus(): MidiAccessStatus {
    return this.status;
  }
  get lastError(): string | null {
    return this.errorMessage;
  }
  get selectedDeviceId(): string | null {
    return this.selectedId;
  }
  /** True when a device is selected AND currently connected and listening. */
  get isListening(): boolean {
    return this.attachedInput !== null;
  }

  /** Must be called from a user gesture (click) for best browser compatibility. */
  async requestAccess(): Promise<boolean> {
    if (this.disposed) return false;
    if (!this.request) {
      this.status = 'unsupported';
      this.changes.emit();
      return false;
    }
    if (this.access) return true;
    this.status = 'requesting';
    this.errorMessage = null;
    this.changes.emit();
    try {
      const access = await this.request({ sysex: false });
      if (this.disposed) return false;
      this.access = access;
      access.addEventListener('statechange', this.handleStateChange);
      this.status = 'granted';
      this.changes.emit();
      return true;
    } catch (err) {
      this.status = 'denied';
      this.errorMessage = err instanceof Error ? err.message : String(err);
      this.changes.emit();
      return false;
    }
  }

  listDevices(): MidiDeviceInfo[] {
    const devices: MidiDeviceInfo[] = [];
    this.access?.inputs.forEach((input) => {
      devices.push({
        id: input.id,
        name: input.name || 'Unnamed MIDI device',
        manufacturer: input.manufacturer || '',
        connected: input.state === 'connected',
      });
    });
    return devices;
  }

  getDeviceName(id: string | null = this.selectedId): string | null {
    if (!id) return null;
    const input = this.access?.inputs.get(id);
    return input ? input.name || 'Unnamed MIDI device' : null;
  }

  /** Select which input to listen to (null = none). Releases held keys of the previous one. */
  selectInput(id: string | null): void {
    if (id === this.selectedId) return;
    this.detach(true);
    this.selectedId = id;
    this.tryAttach();
    this.changes.emit();
  }

  heldNotes(): number[] {
    return this.tracker.heldNotes();
  }

  /** Normalized, filtered note events from the selected device. */
  subscribe(listener: PianoEventListener): Unsubscribe {
    return this.events.on(listener);
  }

  /** Every parsed note event before duplicate filtering (for diagnostics). */
  subscribeRaw(listener: PianoEventListener): Unsubscribe {
    return this.rawEvents.on(listener);
  }

  subscribeStatus(listener: InputStatusListener): Unsubscribe {
    return this.statusEvents.on(listener);
  }

  /** Any change to access status, device list or selection. */
  onChange(listener: () => void): Unsubscribe {
    return this.changes.on(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.detach(true);
    this.access?.removeEventListener('statechange', this.handleStateChange);
    this.access = null;
    this.disposed = true;
    this.events.clear();
    this.rawEvents.clear();
    this.statusEvents.clear();
    this.changes.clear();
  }

  // ---------------------------------------------------------------------

  private tryAttach(): void {
    if (!this.access || !this.selectedId || this.attachedInput) return;
    const input = this.access.inputs.get(this.selectedId);
    if (!input || input.state !== 'connected') return;
    input.addEventListener('midimessage', this.handleMessage);
    this.attachedInput = input;
  }

  private detach(releaseHeld: boolean): void {
    if (this.attachedInput) {
      this.attachedInput.removeEventListener('midimessage', this.handleMessage);
      this.attachedInput = null;
    }
    if (releaseHeld) {
      for (const release of this.tracker.releaseAll(this.now())) this.events.emit(release);
    }
  }

  private readonly handleMessage = (e: MidiMessageEventLike): void => {
    if (!this.attachedInput) return;
    const now = this.now();
    const event = parseMidiMessage(e.data, normalizeTimestamp(e.timeStamp, now), this.attachedInput.id);
    if (!event) return;
    this.rawEvents.emit(event);
    const accepted = this.tracker.process(event);
    if (accepted) this.events.emit(accepted);
  };

  private readonly handleStateChange = (e: MidiConnectionEventLike): void => {
    const port = e.port;
    if (!port || port.type !== 'input') {
      this.changes.emit();
      return;
    }
    const name = port.name || 'MIDI device';
    if (port.id === this.selectedId) {
      if (port.state === 'disconnected' && this.attachedInput) {
        this.detach(true);
        this.statusEvents.emit({ type: 'disconnected', deviceId: port.id, deviceName: name, time: this.now() });
      } else if (port.state === 'connected' && !this.attachedInput) {
        this.tryAttach();
        if (this.attachedInput) {
          this.statusEvents.emit({ type: 'connected', deviceId: port.id, deviceName: name, time: this.now() });
        }
      }
    }
    this.changes.emit();
  };
}
