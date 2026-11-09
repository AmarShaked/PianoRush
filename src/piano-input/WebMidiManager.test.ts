import { beforeEach, describe, expect, it } from 'vitest';
import { detectWebMidi, WebMidiManager } from './WebMidiManager';
import { FakeMidiAccess, FakeMidiInput } from '../test/fakes';
import type { InputStatusEvent, PianoEvent } from './types';

describe('detectWebMidi', () => {
  it('returns null when Web MIDI is unavailable (e.g. Safari)', () => {
    expect(detectWebMidi({})).toBeNull();
    expect(detectWebMidi(undefined)).toBeNull();
  });
  it('returns a bound request function when available', () => {
    expect(detectWebMidi({ requestMIDIAccess: () => Promise.resolve() })).toBeTypeOf('function');
  });
});

describe('WebMidiManager', () => {
  let now = 1000;
  let piano: FakeMidiInput;
  let pad: FakeMidiInput;
  let access: FakeMidiAccess;
  let manager: WebMidiManager;
  let events: PianoEvent[];
  let statuses: InputStatusEvent[];

  beforeEach(async () => {
    now = 1000;
    piano = new FakeMidiInput('piano-1', 'Digital Piano');
    pad = new FakeMidiInput('pad-1', 'Drum Pad');
    access = new FakeMidiAccess([piano, pad]);
    manager = new WebMidiManager({ requestMIDIAccess: () => Promise.resolve(access), now: () => now });
    events = [];
    statuses = [];
    manager.subscribe((e) => events.push(e));
    manager.subscribeStatus((s) => statuses.push(s));
    expect(await manager.requestAccess()).toBe(true);
  });

  it('reports unsupported when no requestMIDIAccess exists', async () => {
    const m = new WebMidiManager({ requestMIDIAccess: null });
    expect(m.isSupported).toBe(false);
    expect(m.accessStatus).toBe('unsupported');
    expect(await m.requestAccess()).toBe(false);
  });

  it('reports denial with the error message', async () => {
    const m = new WebMidiManager({ requestMIDIAccess: () => Promise.reject(new Error('SecurityError: denied')) });
    expect(await m.requestAccess()).toBe(false);
    expect(m.accessStatus).toBe('denied');
    expect(m.lastError).toContain('denied');
  });

  it('lists available devices', () => {
    expect(manager.accessStatus).toBe('granted');
    expect(manager.listDevices().map((d) => d.name)).toEqual(['Digital Piano', 'Drum Pad']);
  });

  it('only emits events from the selected input', () => {
    piano.send([0x90, 60, 100], 1000);
    expect(events).toHaveLength(0);
    manager.selectInput('piano-1');
    piano.send([0x90, 60, 100], 1001);
    pad.send([0x90, 36, 100], 1002);
    expect(events.map((e) => [e.type, e.note, e.deviceId])).toEqual([['noteOn', 60, 'piano-1']]);
  });

  it('normalizes note on/off, velocity-0 note on, and ignores unrelated messages', () => {
    manager.selectInput('piano-1');
    piano.send([0x90, 60, 80], 1000);
    piano.send([0xb0, 64, 127], 1001); // sustain pedal
    piano.send([0xf8], 1002); // clock
    piano.send([0x90, 60, 0], 1003); // note off via velocity 0
    piano.send([0x90, 62, 70], 1004);
    piano.send([0x80, 62, 30], 1005);
    expect(events.map((e) => [e.type, e.note, e.velocity, e.time])).toEqual([
      ['noteOn', 60, 80, 1000],
      ['noteOff', 60, 0, 1003],
      ['noteOn', 62, 70, 1004],
      ['noteOff', 62, 30, 1005],
    ]);
  });

  it('reports the sustain pedal on its own stream (once per change) and lifts it on disconnect', () => {
    const pedals: boolean[] = [];
    manager.subscribePedal((p) => pedals.push(p.down));
    manager.selectInput('piano-1');
    piano.send([0xb0, 64, 127], 1000);
    piano.send([0xb0, 64, 100], 1001); // continuous pedal: still down
    piano.send([0xb0, 64, 0], 1002);
    piano.send([0xb0, 64, 127], 1003);
    expect(pedals).toEqual([true, false, true]);
    expect(manager.isPedalDown).toBe(true);
    expect(events).toHaveLength(0); // never a note
    manager.selectInput('pad-1');
    expect(pedals).toEqual([true, false, true, false]);
  });

  it('filters duplicate noteOns and orphan noteOffs', () => {
    manager.selectInput('piano-1');
    piano.send([0x80, 64, 0], 999);
    piano.send([0x90, 64, 90], 1000);
    piano.send([0x90, 64, 90], 1001);
    expect(events.map((e) => e.type)).toEqual(['noteOn']);
    expect(manager.heldNotes()).toEqual([64]);
  });

  it('falls back to the clock when the device timestamp is missing or from another time base', () => {
    manager.selectInput('piano-1');
    now = 5000;
    piano.send([0x90, 60, 90], 0);
    piano.send([0x90, 62, 90], 123_456_789);
    expect(events.map((e) => e.time)).toEqual([5000, 5000]);
  });

  it('detaches the old listener when switching inputs and releases its held keys', () => {
    manager.selectInput('piano-1');
    piano.send([0x90, 60, 90], 1000);
    manager.selectInput('pad-1');
    expect(piano.listeners.size).toBe(0);
    expect(pad.listeners.size).toBe(1);
    expect(events.map((e) => [e.type, e.note])).toEqual([['noteOn', 60], ['noteOff', 60]]);
  });

  it('on disconnect: releases held keys, reports status, and reattaches on reconnect', () => {
    manager.selectInput('piano-1');
    piano.send([0x90, 60, 90], 1000);
    piano.send([0x90, 64, 90], 1000);
    now = 2000;
    access.setState(piano, 'disconnected');
    expect(events.slice(2).map((e) => [e.type, e.note, e.time])).toEqual([['noteOff', 60, 2000], ['noteOff', 64, 2000]]);
    expect(statuses).toEqual([{ type: 'disconnected', deviceId: 'piano-1', deviceName: 'Digital Piano', time: 2000 }]);
    expect(manager.isListening).toBe(false);
    expect(manager.selectedDeviceId).toBe('piano-1');
    expect(piano.listeners.size).toBe(0);

    access.setState(piano, 'connected');
    expect(statuses[1]?.type).toBe('connected');
    expect(manager.isListening).toBe(true);
    piano.send([0x90, 67, 90], 2100);
    expect(events.at(-1)).toMatchObject({ type: 'noteOn', note: 67 });
  });

  it('ignores disconnects of devices that are not selected', () => {
    manager.selectInput('piano-1');
    access.setState(pad, 'disconnected');
    expect(statuses).toEqual([]);
    expect(manager.isListening).toBe(true);
  });

  it('notifies onChange listeners about hot-plugged devices', () => {
    let changes = 0;
    manager.onChange(() => changes++);
    access.setState(new FakeMidiInput('new-1', 'New Keyboard'), 'connected');
    expect(changes).toBe(1);
    expect(manager.listDevices().map((d) => d.id)).toContain('new-1');
  });

  it('dispose removes every listener it added', () => {
    manager.selectInput('piano-1');
    manager.dispose();
    expect(piano.listeners.size).toBe(0);
    expect(access.stateListeners.size).toBe(0);
    piano.send([0x90, 60, 90], 1000);
    expect(events).toHaveLength(0);
  });
});
