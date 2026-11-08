import { describe, expect, it } from 'vitest';
import { NativeMidiBridge } from './NativeMidiBridge';
import type { InputStatusEvent, PianoEvent } from './types';

describe('NativeMidiBridge (iOS / Android wrapper input)', () => {
  function setup() {
    let now = 5000;
    const bridge = new NativeMidiBridge(() => now);
    const events: PianoEvent[] = [];
    const statuses: InputStatusEvent[] = [];
    bridge.subscribe((e) => events.push(e));
    bridge.subscribeStatus((s) => statuses.push(s));
    return { bridge, events, statuses, setNow: (t: number) => (now = t) };
  }

  it('installs window.PianoRushNative and tells an iOS host it is ready', () => {
    const posted: unknown[] = [];
    const target: Record<string, unknown> = { webkit: { messageHandlers: { pianoRush: { postMessage: (m: unknown) => posted.push(m) } } } };
    new NativeMidiBridge().install(target);
    expect(typeof (target.PianoRushNative as { midi: unknown }).midi).toBe('function');
    expect(posted).toEqual([{ type: 'ready', version: 1 }]);
  });

  it('turns raw MIDI bytes into normalized events, back-dated by the native age', () => {
    const { bridge, events } = setup();
    bridge.api.midi([0x90, 60, 100], 12, 'usb-1', 'Yamaha P-125');
    bridge.api.midi([0x90, 60, 0], 3, 'usb-1');
    expect(events.map((e) => [e.type, e.note, e.time, e.source, e.deviceId])).toEqual([
      ['noteOn', 60, 4988, 'native-midi', 'usb-1'],
      ['noteOff', 60, 4997, 'native-midi', 'usb-1'],
    ]);
    expect(bridge.isActive).toBe(true);
    expect(bridge.deviceNames).toEqual(['Yamaha P-125']);
  });

  it('applies the same filtering as Web MIDI (duplicates, orphans, unrelated messages)', () => {
    const { bridge, events } = setup();
    bridge.api.midi([0xb0, 64, 127]);
    bridge.api.midi([0x80, 62, 0]);
    bridge.api.midi([0x90, 64, 90]);
    bridge.api.midi([0x90, 64, 90]);
    expect(events.map((e) => e.type)).toEqual(['noteOn']);
  });

  it('releases held keys and reports a disconnect (the session auto-pauses on it)', () => {
    const { bridge, events, statuses } = setup();
    bridge.api.midi([0x90, 67, 90], 0, 'ble-1', 'BLE Piano');
    bridge.api.device('ble-1', 'BLE Piano', false);
    expect(events.at(-1)).toMatchObject({ type: 'noteOff', note: 67 });
    expect(statuses.at(-1)).toMatchObject({ type: 'disconnected', deviceName: 'BLE Piano' });
  });
});
