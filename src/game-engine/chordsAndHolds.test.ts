import { describe, expect, it } from 'vitest';
import { GameEngine, type EngineEvent } from './GameEngine';
import { clockAtBeat, makeSong, off, on, START_CLOCK } from '../test/helpers';

const C = 60, D = 62, E = 64, G = 67;

function started(notes: Parameters<typeof makeSong>[0], config = {}) {
  const engine = new GameEngine(makeSong(notes), config);
  const events: EngineEvent[] = [];
  engine.on((e) => events.push(e));
  engine.start(START_CLOCK);
  return { engine, events, judgments: () => events.filter((e) => e.type === 'judgment') };
}

describe('chords (one musical event)', () => {
  it('scores a cleanly played chord once, as its worst key, worth base × keys', () => {
    const { engine, judgments } = started([[C, 0], [E, 0], [G, 0]]);
    engine.handleInput(on(C, clockAtBeat(0)));
    engine.handleInput(on(E, clockAtBeat(0) + 20));
    expect(judgments()).toHaveLength(0); // not resolved until every key is judged
    engine.handleInput(on(G, clockAtBeat(0) + 70)); // great
    expect(judgments()).toHaveLength(1);
    const snap = engine.getSnapshot(0);
    expect(snap.counts).toEqual({ perfect: 0, great: 1, good: 0, miss: 0 });
    expect(snap.combo).toBe(1);
    expect(snap.score).toBe(75 * 3);
  });

  it('downgrades a complete chord whose keys are spread wider than chordWindowMs', () => {
    const { engine } = started([[C, 0], [G, 0]], { chordWindowMs: 100 });
    engine.handleInput(on(C, clockAtBeat(0) - 55)); // perfect
    engine.handleInput(on(G, clockAtBeat(0) + 55)); // perfect, but 110 ms apart
    expect(engine.getSnapshot(0).counts.great).toBe(1);
  });

  it('keeps the judgment when the spread is exactly the window', () => {
    const { engine } = started([[C, 0], [G, 0]], { chordWindowMs: 100 });
    engine.handleInput(on(C, clockAtBeat(0) - 50));
    engine.handleInput(on(G, clockAtBeat(0) + 50));
    expect(engine.getSnapshot(0).counts.perfect).toBe(1);
  });

  it('partial chord: counts as a miss, breaks the combo, keeps half the hit keys’ base points', () => {
    const { engine, judgments } = started([[C, 0], [D, 1], [E, 1], [G, 1]]);
    engine.handleInput(on(C, clockAtBeat(0)));
    engine.handleInput(on(D, clockAtBeat(1)));
    engine.handleInput(on(G, clockAtBeat(1) + 100)); // great; E never played
    engine.update(clockAtBeat(3));
    const snap = engine.getSnapshot(0);
    expect(snap.counts).toEqual({ perfect: 1, great: 0, good: 0, miss: 1 });
    expect(snap.combo).toBe(0);
    expect(snap.score).toBe(100 + Math.round((100 + 75) * 0.5));
    const chord = judgments().at(-1);
    expect(chord?.type === 'judgment' && chord.event.partial).toBe(true);
    expect(engine.getResults().partialChords).toBe(1);
    expect(engine.getResults().totalEvents).toBe(2);
    expect(engine.getResults().noteAccuracy).toBe(0.5);
  });

  it('a completely missed chord is one miss', () => {
    const { engine } = started([[C, 0], [E, 0], [G, 0], [D, 2]]);
    engine.update(clockAtBeat(1.5));
    expect(engine.getSnapshot(0).counts.miss).toBe(1);
  });

  it('emits a per-key note event for every key (for lane feedback)', () => {
    const { engine, events } = started([[C, 0], [G, 0]]);
    engine.handleInput(on(G, clockAtBeat(0)));
    engine.handleInput(on(C, clockAtBeat(0)));
    expect(events.filter((e) => e.type === 'note').map((e) => e.type === 'note' && e.note.midi)).toEqual([G, C]);
  });
});

describe('hold notes (release scored separately)', () => {
  // [C, 0, 2] is a 2-beat (1000 ms) hold at 120 BPM.
  it('awards the hold bonus when the key stays down to the end', () => {
    const { engine, events } = started([[C, 0, 2], [D, 4]]);
    engine.handleInput(on(C, clockAtBeat(0)));
    expect(engine.getSnapshot(0).notes[0]?.hold).toBe('holding');
    engine.update(clockAtBeat(2));
    expect(engine.getSnapshot(0).notes[0]?.hold).toBe('full');
    expect(engine.getSnapshot(0).score).toBe(100 + 50);
    expect(events).toContainEqual(expect.objectContaining({ type: 'hold', result: 'full', points: 50 }));
    engine.handleInput(off(C, clockAtBeat(2.5))); // releasing later changes nothing
    expect(engine.getSnapshot(0).score).toBe(150);
  });

  it('a release inside the tolerance before the end still counts as held', () => {
    const { engine } = started([[C, 0, 2]], { releaseToleranceMs: 220 });
    engine.handleInput(on(C, clockAtBeat(0)));
    engine.handleInput(off(C, clockAtBeat(2) - 220));
    expect(engine.getSnapshot(0).notes[0]?.hold).toBe('full');
  });

  it('an early release loses the bonus but not the hit or the combo', () => {
    const { engine } = started([[C, 0, 2], [D, 2]]);
    engine.handleInput(on(C, clockAtBeat(0)));
    engine.handleInput(off(C, clockAtBeat(1)));
    const snap = engine.getSnapshot(0);
    expect(snap.notes[0]?.hold).toBe('early');
    expect(snap.notes[0]?.status).toBe('hit');
    expect(snap.combo).toBe(1);
    expect(snap.score).toBe(100);
    engine.handleInput(on(D, clockAtBeat(2)));
    expect(engine.getResults().holds).toEqual({ total: 1, full: 0 });
  });

  it('short notes are never hold notes', () => {
    const { engine } = started([[C, 0, 1]]);
    engine.handleInput(on(C, clockAtBeat(0)));
    engine.handleInput(off(C, clockAtBeat(0) + 50));
    expect(engine.getSnapshot(0).notes[0]?.hold).toBe('none');
    expect(engine.getResults().holds.total).toBe(0);
  });

  it('pausing during a hold credits it (nobody can hold through a menu)', () => {
    const { engine } = started([[C, 0, 4]]);
    engine.handleInput(on(C, clockAtBeat(0)));
    engine.pause(clockAtBeat(1));
    expect(engine.getSnapshot(0).notes[0]?.hold).toBe('full');
  });

  it('the level does not finish while a hold is still running', () => {
    const { engine } = started([[C, 0, 4]], { endTailMs: 0 });
    engine.handleInput(on(C, clockAtBeat(0)));
    engine.update(clockAtBeat(3.9));
    expect(engine.currentState).toBe('playing');
    engine.update(clockAtBeat(4));
    expect(engine.currentState).toBe('finished');
    expect(engine.getResults().holds.full).toBe(1);
  });

  it('a lost noteOff followed by a re-strike ends the hold at the re-strike', () => {
    const { engine } = started([[C, 0, 2], [C, 2]]);
    engine.handleInput(on(C, clockAtBeat(0)));
    engine.handleInput(on(C, clockAtBeat(1))); // no noteOff in between
    expect(engine.getSnapshot(0).notes[0]?.hold).toBe('early');
  });
});
