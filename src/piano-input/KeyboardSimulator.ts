import { Emitter } from './Emitter';
import { HeldNotesTracker } from './HeldNotesTracker';
import type { PianoEvent, PianoEventListener, PianoInputSource, Unsubscribe } from './types';

/** Default computer-keyboard mapping (KeyboardEvent.code → MIDI note). */
export const DEFAULT_KEY_MAP: Readonly<Record<string, number>> = {
  KeyA: 60, // C4
  KeyS: 62, // D4
  KeyD: 64, // E4
  KeyF: 65, // F4
  KeyG: 67, // G4
};

/** Structural subset of KeyboardEvent we rely on. */
export interface KeyboardEventLike {
  readonly code: string;
  readonly repeat: boolean;
  readonly timeStamp: number;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly target: unknown;
  preventDefault(): void;
}

/** Structural subset of `window` used for listening. */
export interface KeyboardTargetLike {
  addEventListener(type: 'keydown' | 'keyup', listener: (e: KeyboardEventLike) => void): void;
  removeEventListener(type: 'keydown' | 'keyup', listener: (e: KeyboardEventLike) => void): void;
  addEventListener(type: 'blur', listener: () => void): void;
  removeEventListener(type: 'blur', listener: () => void): void;
}

export interface KeyboardSimulatorOptions {
  target?: KeyboardTargetLike;
  keyMap?: Readonly<Record<string, number>>;
  now?: () => number;
  /** Velocity reported for simulated noteOns. */
  velocity?: number;
}

function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const t = target as { tagName?: unknown; isContentEditable?: unknown };
  const tag = typeof t.tagName === 'string' ? t.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true;
}

/**
 * Lets the game be played with a computer keyboard (A S D F G → C4 D4 E4 F4 G4).
 * Produces exactly the same PianoEvents as the MIDI adapter.
 *
 * Auto-repeat keydowns are suppressed, held keys are tracked, and all keys are
 * released when the window loses focus so nothing gets stuck.
 */
export class KeyboardSimulator implements PianoInputSource {
  readonly kind = 'keyboard' as const;
  static readonly DEVICE_ID = 'keyboard-simulator';

  private readonly target: KeyboardTargetLike | null;
  private readonly keyMap: Readonly<Record<string, number>>;
  private readonly now: () => number;
  private readonly velocity: number;
  private readonly tracker = new HeldNotesTracker({ duplicateWindowMs: Number.POSITIVE_INFINITY });
  private readonly events = new Emitter<PianoEvent>();
  private enabled = false;

  constructor(options: KeyboardSimulatorOptions = {}) {
    this.target = options.target ?? (typeof window !== 'undefined' ? (window as unknown as KeyboardTargetLike) : null);
    this.keyMap = options.keyMap ?? DEFAULT_KEY_MAP;
    this.now = options.now ?? (() => performance.now());
    this.velocity = options.velocity ?? 96;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  enable(): void {
    if (this.enabled || !this.target) return;
    this.target.addEventListener('keydown', this.handleKeyDown);
    this.target.addEventListener('keyup', this.handleKeyUp);
    this.target.addEventListener('blur', this.handleBlur);
    this.enabled = true;
  }

  disable(): void {
    if (!this.enabled || !this.target) return;
    this.target.removeEventListener('keydown', this.handleKeyDown);
    this.target.removeEventListener('keyup', this.handleKeyUp);
    this.target.removeEventListener('blur', this.handleBlur);
    this.enabled = false;
    this.releaseAll();
  }

  subscribe(listener: PianoEventListener): Unsubscribe {
    return this.events.on(listener);
  }

  heldNotes(): number[] {
    return this.tracker.heldNotes();
  }

  noteForCode(code: string): number | undefined {
    return this.keyMap[code];
  }

  dispose(): void {
    this.disable();
    this.events.clear();
  }

  private eventTime(e: KeyboardEventLike): number {
    const now = this.now();
    const ts = e.timeStamp;
    return Number.isFinite(ts) && ts > 0 && Math.abs(now - ts) < 1000 ? ts : now;
  }

  private readonly handleKeyDown = (e: KeyboardEventLike): void => {
    const note = this.keyMap[e.code];
    if (note === undefined || e.ctrlKey || e.metaKey || e.altKey || isEditableTarget(e.target)) return;
    e.preventDefault();
    if (e.repeat) return;
    const accepted = this.tracker.process({
      type: 'noteOn',
      note,
      velocity: this.velocity,
      time: this.eventTime(e),
      channel: 0,
      source: 'keyboard',
      deviceId: KeyboardSimulator.DEVICE_ID,
    });
    if (accepted) this.events.emit(accepted);
  };

  private readonly handleKeyUp = (e: KeyboardEventLike): void => {
    const note = this.keyMap[e.code];
    if (note === undefined) return;
    const accepted = this.tracker.process({
      type: 'noteOff',
      note,
      velocity: 0,
      time: this.eventTime(e),
      channel: 0,
      source: 'keyboard',
      deviceId: KeyboardSimulator.DEVICE_ID,
    });
    if (accepted) this.events.emit(accepted);
  };

  private readonly handleBlur = (): void => {
    this.releaseAll();
  };

  private releaseAll(): void {
    for (const release of this.tracker.releaseAll(this.now())) this.events.emit(release);
  }
}
