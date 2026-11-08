import { describe, expect, it } from 'vitest';
import { GameSession, type SessionNotice } from './GameSession';
import { ManualClock } from '../game-engine/clock';
import { KeyboardSimulator } from '../piano-input/KeyboardSimulator';
import { WebMidiManager } from '../piano-input/WebMidiManager';
import { FakeKeyboardTarget, FakeMidiAccess, FakeMidiInput } from '../test/fakes';
import { makeSong } from '../test/helpers';

async function setup() {
  const clock = new ManualClock(1000);
  const piano = new FakeMidiInput('p', 'Stage Piano');
  const access = new FakeMidiAccess([piano]);
  const midi = new WebMidiManager({ requestMIDIAccess: () => Promise.resolve(access), now: () => clock.now() });
  await midi.requestAccess();
  midi.selectInput('p');
  const keysTarget = new FakeKeyboardTarget();
  const keys = new KeyboardSimulator({ target: keysTarget, now: () => clock.now() });
  keys.enable();
  const session = new GameSession({ song: makeSong([[60, 0], [62, 1], [64, 2]]), inputs: [midi, keys], clock });
  const notices: SessionNotice[] = [];
  session.onNotice((n) => notices.push(n));
  return { clock, piano, access, midi, keys, keysTarget, session, notices };
}

describe('GameSession', () => {
  it('routes MIDI and keyboard events through the same engine path', async () => {
    const { clock, piano, keysTarget, session } = await setup();
    session.start();
    clock.set(3000);
    piano.send([0x90, 60, 100], 3000);
    keysTarget.key('keydown', 'KeyS', 3500);
    const snap = session.frame();
    expect(snap.counts.perfect).toBe(2);
    expect(snap.combo).toBe(2);
  });

  it('auto-pauses and notifies when the MIDI device disconnects mid-song', async () => {
    const { clock, piano, access, session, notices } = await setup();
    session.start();
    clock.set(3000);
    piano.send([0x90, 60, 100], 3000);
    clock.set(3200);
    access.setState(piano, 'disconnected');
    expect(session.engine.currentState).toBe('paused');
    expect(notices).toEqual([{ type: 'device-disconnected', deviceName: 'Stage Piano' }]);
    // The held key was released, so nothing is stuck.
    expect(session.frame().heldNotes.size).toBe(0);
    // Song time is frozen while disconnected: no notes are missed.
    clock.set(60_000);
    expect(session.frame().counts.miss).toBe(0);

    access.setState(piano, 'connected');
    expect(notices.at(-1)).toEqual({ type: 'device-reconnected', deviceName: 'Stage Piano' });
    expect(session.engine.currentState).toBe('paused'); // player resumes deliberately
  });

  it('restart begins a new count-in without reloading', async () => {
    const { clock, piano, session } = await setup();
    session.start();
    clock.set(3000);
    piano.send([0x90, 60, 100], 3000);
    piano.send([0x80, 60, 0], 3050);
    clock.set(20_000);
    expect(session.frame().state).toBe('finished');
    session.restart();
    let snap = session.frame();
    expect(snap.state).toBe('countdown');
    expect(snap.score).toBe(0);
    clock.set(22_000);
    piano.send([0x90, 60, 100], 22_000);
    snap = session.frame();
    expect(snap.counts.perfect).toBe(1);
  });

  it('dispose unsubscribes from all inputs', async () => {
    const { clock, piano, session } = await setup();
    session.start();
    session.dispose();
    clock.set(3000);
    piano.send([0x90, 60, 100], 3000);
    expect(session.frame().counts.perfect).toBe(0);
  });
});
