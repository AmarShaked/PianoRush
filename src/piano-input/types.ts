/**
 * Normalized musical input contract.
 *
 * Every input adapter (Web MIDI, keyboard simulator, and — in future
 * milestones — microphone pitch detection or native MIDI bridges) produces
 * these events. The game engine only ever sees `PianoEvent`s, never a
 * browser API object.
 */

export type PianoEventType = 'noteOn' | 'noteOff';

/** Where an event came from. `microphone` and `native-midi` are reserved for future adapters. */
export type InputSourceKind = 'midi' | 'keyboard' | 'microphone' | 'native-midi';

export interface PianoEvent {
  readonly type: PianoEventType;
  /** MIDI note number, 0–127 (60 = middle C / C4). */
  readonly note: number;
  /** 1–127 for noteOn. Release velocity (often 0) for noteOff. */
  readonly velocity: number;
  /**
   * Monotonic timestamp in milliseconds, in the same time base as
   * `performance.now()`. Adapters must convert into this base.
   */
  readonly time: number;
  /** MIDI channel 0–15 (0 for non-MIDI sources). */
  readonly channel: number;
  readonly source: InputSourceKind;
  /** Stable identifier of the physical/virtual device that produced the event. */
  readonly deviceId: string;
}

export type PianoEventListener = (event: PianoEvent) => void;
export type Unsubscribe = () => void;

/**
 * Sustain (damper) pedal, MIDI CC64. Kept out of `PianoEvent` on purpose:
 * the pedal only changes how the built-in piano sounds; it is never scored.
 */
export interface PedalEvent {
  readonly type: 'sustain';
  readonly down: boolean;
  /** Same time base as PianoEvent.time. */
  readonly time: number;
  readonly source: InputSourceKind;
  readonly deviceId: string;
}

export type PedalListener = (event: PedalEvent) => void;

export interface InputStatusEvent {
  readonly type: 'connected' | 'disconnected';
  readonly deviceId: string;
  readonly deviceName: string;
  readonly time: number;
}

export type InputStatusListener = (event: InputStatusEvent) => void;

/**
 * A stream of normalized piano events. Implemented by the MIDI manager and
 * the keyboard simulator; future adapters (microphone, native MIDI) plug in
 * through this same interface.
 */
export interface PianoInputSource {
  readonly kind: InputSourceKind;
  subscribe(listener: PianoEventListener): Unsubscribe;
  /** Optional device status notifications (connect / disconnect). */
  subscribeStatus?(listener: InputStatusListener): Unsubscribe;
  /** Optional sustain-pedal stream (MIDI CC64, or Space on the computer keyboard). */
  subscribePedal?(listener: PedalListener): Unsubscribe;
}
