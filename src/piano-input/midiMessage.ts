import type { InputSourceKind, PedalEvent, PianoEvent } from './types';

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;
const SUSTAIN_PEDAL = 64;

/**
 * Parse one raw MIDI message into a normalized PianoEvent.
 *
 * - Note On (0x9n) with velocity > 0 → noteOn
 * - Note On with velocity 0 → noteOff (running-status style note release)
 * - Note Off (0x8n) → noteOff
 * - Everything else (CC, pitch bend, aftertouch, clock, active sensing,
 *   SysEx, malformed data) → null (ignored)
 */
export function parseMidiMessage(
  data: ArrayLike<number> | null | undefined,
  time: number,
  deviceId: string,
  source: InputSourceKind = 'midi',
): PianoEvent | null {
  if (!data || data.length < 3) return null;
  const status = data[0] ?? 0;
  const note = data[1] ?? -1;
  const velocity = data[2] ?? -1;
  if (status < 0x80 || status > 0xef) return null; // not a channel voice message
  if (note < 0 || note > 127 || velocity < 0 || velocity > 127) return null;

  const command = status & 0xf0;
  const channel = status & 0x0f;

  if (command === NOTE_ON) {
    return {
      type: velocity === 0 ? 'noteOff' : 'noteOn',
      note,
      velocity,
      time,
      channel,
      source,
      deviceId,
    };
  }
  if (command === NOTE_OFF) {
    return { type: 'noteOff', note, velocity, time, channel, source, deviceId };
  }
  return null;
}

/**
 * Parse a sustain-pedal message (Control Change 64). Values 64–127 mean down,
 * 0–63 up (continuous / half-pedal controllers are treated as on or off).
 * Anything else → null.
 */
export function parseSustainPedal(
  data: ArrayLike<number> | null | undefined,
  time: number,
  deviceId: string,
  source: InputSourceKind = 'midi',
): PedalEvent | null {
  if (!data || data.length < 3) return null;
  const status = data[0] ?? 0;
  const value = data[2] ?? -1;
  if ((status & 0xf0) !== CONTROL_CHANGE || status > 0xbf || data[1] !== SUSTAIN_PEDAL || value < 0 || value > 127) return null;
  return { type: 'sustain', down: value >= 64, time, source, deviceId };
}
