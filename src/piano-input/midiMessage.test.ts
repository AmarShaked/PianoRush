import { describe, expect, it } from 'vitest';
import { parseMidiMessage, parseSustainPedal } from './midiMessage';
import { HeldNotesTracker } from './HeldNotesTracker';
import { midiToNoteName, isBlackKey } from './noteNames';
import type { PianoEvent } from './types';

describe('parseSustainPedal', () => {
  it('reads CC64 on any channel: 64–127 down, 0–63 up', () => {
    expect(parseSustainPedal([0xb0, 64, 127], 5, 'dev')).toEqual({ type: 'sustain', down: true, time: 5, source: 'midi', deviceId: 'dev' });
    expect(parseSustainPedal([0xb3, 64, 64], 5, 'dev')?.down).toBe(true);
    expect(parseSustainPedal([0xb0, 64, 63], 5, 'dev')?.down).toBe(false);
    expect(parseSustainPedal([0xb0, 64, 0], 5, 'dev', 'native-midi')).toMatchObject({ down: false, source: 'native-midi' });
  });

  it('ignores other controllers and messages', () => {
    expect(parseSustainPedal([0xb0, 67, 127], 0, 'dev')).toBeNull(); // soft pedal
    expect(parseSustainPedal([0xb0, 1, 127], 0, 'dev')).toBeNull(); // mod wheel
    expect(parseSustainPedal([0x90, 64, 127], 0, 'dev')).toBeNull(); // note E4
    expect(parseSustainPedal([0xb0, 64], 0, 'dev')).toBeNull();
    expect(parseSustainPedal(null, 0, 'dev')).toBeNull();
  });
});

describe('parseMidiMessage', () => {
  it('parses Note On', () => {
    expect(parseMidiMessage([0x90, 60, 100], 12.5, 'dev')).toEqual({
      type: 'noteOn', note: 60, velocity: 100, time: 12.5, channel: 0, source: 'midi', deviceId: 'dev',
    });
  });

  it('treats Note On with velocity 0 as Note Off', () => {
    expect(parseMidiMessage([0x93, 64, 0], 1, 'dev')).toMatchObject({ type: 'noteOff', note: 64, channel: 3 });
  });

  it('parses Note Off with release velocity on any channel', () => {
    expect(parseMidiMessage([0x8f, 67, 40], 1, 'dev')).toMatchObject({ type: 'noteOff', note: 67, velocity: 40, channel: 15 });
  });

  it.each([
    ['control change (sustain pedal)', [0xb0, 64, 127]],
    ['program change', [0xc0, 5]],
    ['pitch bend', [0xe0, 0, 64]],
    ['poly aftertouch', [0xa0, 60, 30]],
    ['channel pressure', [0xd0, 30]],
    ['timing clock', [0xf8]],
    ['active sensing', [0xfe]],
    ['sysex', [0xf0, 0x7e, 0x7f, 0xf7]],
    ['empty', []],
    ['truncated note on', [0x90, 60]],
    ['data byte as status', [0x40, 60, 100]],
    ['out-of-range data byte', [0x90, 200, 100]],
  ])('ignores %s', (_, bytes) => {
    expect(parseMidiMessage(bytes, 0, 'dev')).toBeNull();
  });

  it('ignores null data', () => {
    expect(parseMidiMessage(null, 0, 'dev')).toBeNull();
  });
});

describe('HeldNotesTracker', () => {
  const ev = (type: PianoEvent['type'], note: number, time: number): PianoEvent => ({
    type, note, velocity: type === 'noteOn' ? 90 : 0, time, channel: 0, source: 'midi', deviceId: 'd',
  });

  it('tracks held keys', () => {
    const t = new HeldNotesTracker();
    t.process(ev('noteOn', 64, 0));
    t.process(ev('noteOn', 60, 1));
    expect(t.heldNotes()).toEqual([60, 64]);
    t.process(ev('noteOff', 64, 5));
    expect(t.heldNotes()).toEqual([60]);
  });

  it('drops a duplicate noteOn within the duplicate window, accepts a later re-strike', () => {
    const t = new HeldNotesTracker({ duplicateWindowMs: 30 });
    expect(t.process(ev('noteOn', 60, 0))).not.toBeNull();
    expect(t.process(ev('noteOn', 60, 10))).toBeNull();
    expect(t.process(ev('noteOn', 60, 500))).not.toBeNull();
  });

  it('drops orphan noteOffs', () => {
    const t = new HeldNotesTracker();
    expect(t.process(ev('noteOff', 60, 0))).toBeNull();
  });

  it('releaseAll emits synthetic noteOffs and clears state', () => {
    const t = new HeldNotesTracker();
    t.process(ev('noteOn', 62, 0));
    t.process(ev('noteOn', 60, 0));
    const releases = t.releaseAll(99);
    expect(releases.map((r) => [r.type, r.note, r.time])).toEqual([['noteOff', 60, 99], ['noteOff', 62, 99]]);
    expect(t.heldNotes()).toEqual([]);
  });
});

describe('note names', () => {
  it('uses scientific pitch notation with middle C = C4', () => {
    expect(midiToNoteName(60)).toBe('C4');
    expect(midiToNoteName(67)).toBe('G4');
    expect(midiToNoteName(21)).toBe('A0');
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(64)).toBe(false);
  });
});
