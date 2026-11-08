import { describe, expect, it } from 'vitest';
import { GameEngine } from './GameEngine';
import { clockAtBeat, makeSong, off, on, START_CLOCK } from '../test/helpers';

const C = 60, D = 62, E = 64, G = 67;

function discover(notes: Parameters<typeof makeSong>[0]) {
  const engine = new GameEngine(makeSong(notes), { waitForNotes: true });
  engine.start(START_CLOCK);
  return engine;
}

describe('Discover mode (wait for notes)', () => {
  it('stops exactly when the next note reaches the hit line', () => {
    const engine = discover([[C, 0], [D, 1]]);
    engine.update(clockAtBeat(0) + 37); // the frame overshoots the note time
    expect(engine.currentState).toBe('waiting');
    expect(engine.songTimeAt(clockAtBeat(0) + 5000)).toBe(0);
    expect(engine.getSnapshot(clockAtBeat(0) + 5000).waitingFor).toEqual([C]);
  });

  it('never misses a note: it waits as long as it takes', () => {
    const engine = discover([[C, 0]]);
    engine.update(clockAtBeat(0) + 10);
    engine.update(clockAtBeat(0) + 60_000);
    expect(engine.getSnapshot(0).notes[0]?.status).toBe('pending');
    expect(engine.currentState).toBe('waiting');
  });

  it('continues from the moment the right key is played', () => {
    const engine = discover([[C, 0], [D, 1]]);
    engine.update(clockAtBeat(0) + 20);
    const pressAt = clockAtBeat(0) + 4000;
    const hit = engine.handleInput(on(C, pressAt));
    expect(hit?.judgment).toBe('perfect'); // the tile is on the line while waiting
    expect(engine.currentState).toBe('playing');
    // Time resumes from beat 0 at the press: D (beat 1) is due 500 ms later.
    expect(engine.songTimeAt(pressAt + 500)).toBe(500);
    expect(engine.handleInput(on(D, pressAt + 500))?.judgment).toBe('perfect');
  });

  it('counts wrong keys while waiting and keeps waiting', () => {
    const engine = discover([[C, 0]]);
    engine.update(clockAtBeat(0) + 20);
    expect(engine.handleInput(on(E, clockAtBeat(0) + 900))).toBeNull();
    expect(engine.currentState).toBe('waiting');
    expect(engine.getSnapshot(0).wrongNotes).toBe(1);
  });

  it('waits for every key of a chord, in any order', () => {
    const engine = discover([[C, 0], [E, 0], [G, 0]]);
    engine.update(clockAtBeat(0) + 20);
    engine.handleInput(on(G, clockAtBeat(0) + 1000));
    expect(engine.currentState).toBe('waiting');
    expect(engine.getSnapshot(0).waitingFor).toEqual([C, E]);
    engine.handleInput(on(C, clockAtBeat(0) + 1200));
    engine.handleInput(on(E, clockAtBeat(0) + 1300));
    expect(engine.currentState).toBe('playing');
    expect(engine.getSnapshot(0).counts.perfect).toBe(1);
  });

  it('a note played early (in its window) is accepted without stopping', () => {
    const engine = discover([[C, 0], [D, 1]]);
    expect(engine.handleInput(on(C, clockAtBeat(0) - 100))?.judgment).toBe('great');
    engine.update(clockAtBeat(0) + 100);
    expect(engine.currentState).toBe('playing');
  });

  it('starts the wait even if no frame ran before the press', () => {
    const engine = discover([[C, 0], [D, 1]]);
    // No update() since start; the press comes 3 s after C reached the line.
    expect(engine.handleInput(on(C, clockAtBeat(0) + 3000))?.judgment).toBe('perfect');
    expect(engine.getSnapshot(0).counts.miss).toBe(0);
  });

  it('a user pause during a wait resumes into the same wait without a countdown', () => {
    const engine = discover([[C, 0], [D, 1]]);
    engine.update(clockAtBeat(0) + 20);
    engine.pause(clockAtBeat(0) + 1000);
    expect(engine.currentState).toBe('paused');
    expect(engine.handleInput(on(C, clockAtBeat(0) + 1500))).toBeNull(); // ignored while paused
    engine.handleInput(off(C, clockAtBeat(0) + 1600));
    engine.resume(clockAtBeat(0) + 2000);
    engine.update(clockAtBeat(0) + 2010);
    expect(engine.currentState).toBe('waiting');
    expect(engine.songTimeAt(clockAtBeat(0) + 9000)).toBe(0);
    expect(engine.handleInput(on(C, clockAtBeat(0) + 9000))?.judgment).toBe('perfect');
  });

  it('finishes after the last note is played', () => {
    const engine = discover([[C, 0], [D, 1]]);
    engine.handleInput(on(C, clockAtBeat(0) + 2000));
    engine.handleInput(on(D, clockAtBeat(1) + 2000 + 3000));
    engine.update(clockAtBeat(30));
    expect(engine.currentState).toBe('finished');
    expect(engine.getResults().counts).toEqual({ perfect: 2, great: 0, good: 0, miss: 0 });
  });
});
