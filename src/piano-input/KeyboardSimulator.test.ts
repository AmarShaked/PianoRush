import { beforeEach, describe, expect, it } from 'vitest';
import { KeyboardSimulator } from './KeyboardSimulator';
import { FakeKeyboardTarget } from '../test/fakes';
import type { PianoEvent } from './types';

describe('KeyboardSimulator', () => {
  let target: FakeKeyboardTarget;
  let sim: KeyboardSimulator;
  let events: PianoEvent[];
  let now = 0;

  beforeEach(() => {
    now = 500;
    target = new FakeKeyboardTarget();
    sim = new KeyboardSimulator({ target, now: () => now });
    events = [];
    sim.subscribe((e) => events.push(e));
    sim.enable();
  });

  it('maps A S D F G to C4 D4 E4 F4 G4 using the same PianoEvent shape as MIDI', () => {
    for (const [i, code] of ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG'].entries()) target.key('keydown', code, 400 + i);
    expect(events.map((e) => e.note)).toEqual([60, 62, 64, 65, 67]);
    expect(events[0]).toEqual({
      type: 'noteOn', note: 60, velocity: 96, time: 400, channel: 0, source: 'keyboard', deviceId: 'keyboard-simulator',
    });
  });

  it('holds the sustain pedal with Space, without producing a note', () => {
    const pedals: boolean[] = [];
    sim.subscribePedal((p) => pedals.push(p.down));
    target.key('keydown', 'Space', 400);
    target.key('keydown', 'Space', 430, { repeat: true });
    target.key('keyup', 'Space', 600);
    expect(pedals).toEqual([true, false]);
    expect(events).toHaveLength(0);
  });

  it('lifts the pedal when disabled', () => {
    const pedals: boolean[] = [];
    sim.subscribePedal((p) => pedals.push(p.down));
    target.key('keydown', 'Space', 400);
    sim.disable();
    expect(pedals).toEqual([true, false]);
  });

  it('suppresses auto-repeat keydowns and tracks held keys', () => {
    target.key('keydown', 'KeyD', 400);
    target.key('keydown', 'KeyD', 430, { repeat: true });
    target.key('keydown', 'KeyD', 460, { repeat: true });
    expect(events).toHaveLength(1);
    expect(sim.heldNotes()).toEqual([64]);
    target.key('keyup', 'KeyD', 490);
    expect(events.map((e) => e.type)).toEqual(['noteOn', 'noteOff']);
    expect(sim.heldNotes()).toEqual([]);
  });

  it('suppresses a second keydown without keyup even if repeat is not flagged', () => {
    target.key('keydown', 'KeyA', 400);
    target.key('keydown', 'KeyA', 900);
    expect(events).toHaveLength(1);
  });

  it('covers three octaves plus black keys in the DAW layout', () => {
    for (const [code, note] of [['KeyZ', 48], ['KeyM', 59], ['KeyK', 72], ['Quote', 77], ['KeyW', 61], ['KeyU', 70], ['KeyP', 75]] as const) {
      target.key('keydown', code, 400);
      expect(events.at(-1)?.note).toBe(note);
    }
  });

  it('ignores unmapped keys, modifier chords and typing in form fields', () => {
    target.key('keydown', 'KeyQ', 400);
    target.key('keydown', 'KeyA', 400, { metaKey: true });
    target.key('keydown', 'KeyA', 400, { target: { tagName: 'INPUT' } });
    target.key('keyup', 'KeyA', 410); // orphan keyup
    expect(events).toHaveLength(0);
  });

  it('prevents default browser behaviour for mapped keys only', () => {
    expect(target.key('keydown', 'KeyA', 400)).toBe(true);
    expect(target.key('keydown', 'Digit1', 400)).toBe(false);
  });

  it('releases all held keys when the window loses focus', () => {
    target.key('keydown', 'KeyA', 400);
    target.key('keydown', 'KeyG', 401);
    now = 700;
    target.blur();
    expect(events.slice(2).map((e) => [e.type, e.note, e.time])).toEqual([['noteOff', 60, 700], ['noteOff', 67, 700]]);
  });

  it('disable removes listeners and releases held keys', () => {
    target.key('keydown', 'KeyS', 400);
    sim.disable();
    expect(target.listenerCount).toBe(0);
    expect(events.at(-1)).toMatchObject({ type: 'noteOff', note: 62 });
    target.key('keydown', 'KeyS', 800);
    expect(events).toHaveLength(2);
  });

  it('enable is idempotent', () => {
    sim.enable();
    sim.enable();
    expect(target.listenerCount).toBe(3);
  });
});
