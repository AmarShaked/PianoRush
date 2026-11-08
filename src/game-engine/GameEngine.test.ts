import { describe, expect, it } from 'vitest';
import { GameEngine, type EngineEvent } from './GameEngine';
import { comboMultiplier, DEFAULT_SCORING } from './index';
import { BEAT0, clockAtBeat, makeSong, off, on, START_CLOCK, tap } from '../test/helpers';

const C = 60, D = 62, E = 64, F = 65, G = 67;

function started(notes: Parameters<typeof makeSong>[0], config = {}) {
  const engine = new GameEngine(makeSong(notes), config);
  engine.start(START_CLOCK);
  return engine;
}

describe('pitch matching', () => {
  it('scores a correct pitch at the exact time as Perfect', () => {
    const engine = started([[C, 0]]);
    const hit = engine.handleInput(on(C, clockAtBeat(0)));
    expect(hit?.judgment).toBe('perfect');
    expect(hit?.offsetMs).toBe(0);
    const snap = engine.getSnapshot(clockAtBeat(0));
    expect(snap.score).toBe(100);
    expect(snap.combo).toBe(1);
    expect(snap.notes[0]?.status).toBe('hit');
  });

  it('does not match a wrong pitch, counts it, and the expected note is later missed', () => {
    const engine = started([[C, 0], [E, 1]]);
    expect(engine.handleInput(on(C, clockAtBeat(0)))?.judgment).toBe('perfect');
    expect(engine.handleInput(on(D, clockAtBeat(1)))).toBeNull();
    let snap = engine.getSnapshot(clockAtBeat(1));
    expect(snap.wrongNotes).toBe(1);
    expect(snap.combo).toBe(0); // wrong note breaks combo by default
    expect(snap.notes[1]?.status).toBe('pending');

    engine.update(clockAtBeat(1) + 1000);
    snap = engine.getSnapshot(clockAtBeat(1) + 1000);
    expect(snap.notes[1]?.status).toBe('missed');
    expect(snap.counts).toEqual({ perfect: 1, great: 0, good: 0, miss: 1 });
  });

  it('can be configured so wrong notes do not break the combo', () => {
    const engine = started([[C, 0], [E, 1]], { wrongNoteBreaksCombo: false });
    engine.handleInput(on(C, clockAtBeat(0)));
    engine.handleInput(on(D, clockAtBeat(0.5)));
    expect(engine.getSnapshot(clockAtBeat(0.5)).combo).toBe(1);
  });

  it('ignores notes outside the song lanes as wrong notes with no lane', () => {
    const engine = started([[C, 0]]);
    const events: EngineEvent[] = [];
    engine.on((e) => events.push(e));
    engine.handleInput(on(72, clockAtBeat(0)));
    expect(events).toContainEqual(expect.objectContaining({ type: 'wrongNote', midi: 72, lane: null }));
  });
});

describe('timing judgments', () => {
  it.each([
    [-100, 'great'],
    [100, 'great'],
    [-200, 'good'],
    [200, 'good'],
    [-30, 'perfect'],
    [45, 'perfect'],
  ] as const)('offset %i ms → %s', (offset, judgment) => {
    const engine = started([[C, 0]]);
    const hit = engine.handleInput(on(C, clockAtBeat(0) + offset));
    expect(hit?.judgment).toBe(judgment);
    expect(hit?.offsetMs).toBe(offset);
  });

  it.each([
    [60, 'perfect'],
    [-60, 'perfect'],
    [60.5, 'great'],
    [130, 'great'],
    [-130, 'great'],
    [130.5, 'good'],
    [220, 'good'],
    [-220, 'good'],
  ] as const)('exact boundary %d ms → %s (edges are inclusive)', (offset, judgment) => {
    const engine = started([[C, 0]]);
    expect(engine.handleInput(on(C, clockAtBeat(0) + offset))?.judgment).toBe(judgment);
  });

  it.each([220.5, -220.5, 400, -400])('offset %d ms is outside every window → not a hit', (offset) => {
    const engine = started([[C, 2]]);
    expect(engine.handleInput(on(C, clockAtBeat(2) + offset))).toBeNull();
    expect(engine.getSnapshot(0).wrongNotes).toBe(1);
    expect(engine.getSnapshot(0).notes[0]?.status).toBe(offset > 0 ? 'missed' : 'pending');
  });

  it('honours custom timing windows', () => {
    const engine = started([[C, 0], [D, 1]], { windows: { perfect: 20, great: 40, good: 50 } });
    expect(engine.handleInput(on(C, clockAtBeat(0) + 30))?.judgment).toBe('great');
    expect(engine.handleInput(on(D, clockAtBeat(1) + 60))).toBeNull();
  });

  it('rejects inconsistent timing windows', () => {
    expect(() => new GameEngine(makeSong([[C, 0]]), { windows: { perfect: 100, great: 50 } })).toThrow();
  });

  it('applies the input offset (calibration hook)', () => {
    const engine = started([[C, 0]], { inputOffsetMs: 80 });
    // Device reports the press 80 ms late; offset compensates → Perfect.
    expect(engine.handleInput(on(C, clockAtBeat(0) + 80))?.judgment).toBe('perfect');
  });

  it('does not penalise unmatched key presses during the count-in', () => {
    const engine = started([[C, 0]]);
    expect(engine.handleInput(on(E, clockAtBeat(-2)))).toBeNull();
    engine.handleInput(off(E, clockAtBeat(-1.5)));
    expect(engine.getSnapshot(0).wrongNotes).toBe(0);
  });

  it('allows hitting the first note slightly early during the count-in', () => {
    const engine = started([[C, 0]]);
    engine.update(clockAtBeat(0) - 100);
    expect(engine.currentState).toBe('countdown');
    expect(engine.handleInput(on(C, clockAtBeat(0) - 100))?.judgment).toBe('great');
  });
});

describe('missed notes', () => {
  it('declares a miss only after the Good window plus grace has passed', () => {
    const engine = started([[C, 0], [D, 1]]);
    engine.handleInput(on(C, clockAtBeat(0)));
    engine.update(clockAtBeat(1) + 220 + 40); // exactly at window + grace: still pending
    expect(engine.getSnapshot(0).notes[1]?.status).toBe('pending');
    engine.update(clockAtBeat(1) + 261);
    const snap = engine.getSnapshot(0);
    expect(snap.notes[1]?.status).toBe('missed');
    expect(snap.notes[1]?.judgment).toBe('miss');
    expect(snap.combo).toBe(0);
    expect(snap.maxCombo).toBe(1);
    expect(snap.counts.miss).toBe(1);
  });

  it('still judges an input delivered late by its own timestamp (within grace)', () => {
    const engine = started([[C, 0]]);
    engine.update(clockAtBeat(0) + 250); // frame runs before the event is delivered
    expect(engine.handleInput(on(C, clockAtBeat(0) + 215))?.judgment).toBe('good');
  });

  it('breaks combo in musical order: a skipped note is missed before the next hit counts', () => {
    const engine = started([[C, 0], [D, 1], [E, 2]]);
    engine.handleInput(on(C, clockAtBeat(0)));
    // skip D entirely; no frame updates in between
    engine.handleInput(on(E, clockAtBeat(2)));
    const snap = engine.getSnapshot(0);
    expect(snap.notes.map((n) => n.status)).toEqual(['hit', 'missed', 'hit']);
    expect(snap.combo).toBe(1);
    expect(snap.maxCombo).toBe(1);
  });
});

describe('duplicate, repeated and overlapping input', () => {
  it('ignores a duplicate noteOn for an already-held key', () => {
    const engine = started([[C, 0, 0.5], [C, 0.5]]);
    expect(engine.handleInput(on(C, clockAtBeat(0)))?.judgment).toBe('perfect');
    expect(engine.handleInput(on(C, clockAtBeat(0) + 5))).toBeNull();
    const snap = engine.getSnapshot(0);
    expect(snap.notes[1]?.status).toBe('pending'); // duplicate did not steal the next note
    expect(snap.wrongNotes).toBe(0);
    expect(snap.score).toBe(100);
  });

  it('ignores the exact same event delivered twice', () => {
    const engine = started([[C, 0, 0.25], [C, 0.25]]);
    const ev = on(C, clockAtBeat(0));
    engine.handleInput(ev);
    engine.handleInput(ev);
    expect(engine.getSnapshot(0).counts.perfect).toBe(1);
    expect(engine.getSnapshot(0).notes[1]?.status).toBe('pending');
  });

  it('scores each expected note at most once (second press is a wrong note)', () => {
    const engine = started([[C, 0]]);
    engine.handleInput(on(C, clockAtBeat(0)));
    engine.handleInput(off(C, clockAtBeat(0) + 50));
    expect(engine.handleInput(on(C, clockAtBeat(0) + 100))).toBeNull();
    const snap = engine.getSnapshot(0);
    expect(snap.counts.perfect).toBe(1);
    expect(snap.score).toBe(100);
    expect(snap.wrongNotes).toBe(1);
  });

  it('ignores orphan noteOffs', () => {
    const engine = started([[C, 0]]);
    expect(engine.handleInput(off(C, clockAtBeat(0)))).toBeNull();
    expect(engine.getSnapshot(0).wrongNotes).toBe(0);
  });

  it('handles rapid repeated notes of the same pitch in order', () => {
    // Four sixteenth notes on E at 120 BPM: 125 ms apart (windows overlap).
    const engine = started([[E, 0, 0.25], [E, 0.25, 0.25], [E, 0.5, 0.25], [E, 0.75, 0.25]]);
    const results = [0, 1, 2, 3].map((i) => {
      const t = clockAtBeat(0) + i * 125;
      const hit = engine.handleInput(on(E, t));
      engine.handleInput(off(E, t + 60));
      return [hit?.note.id, hit?.judgment];
    });
    expect(results).toEqual([[0, 'perfect'], [1, 'perfect'], [2, 'perfect'], [3, 'perfect']]);
  });

  it('assigns consistently late repeated presses to the earliest note, not the closest', () => {
    const engine = started([[E, 0, 0.25], [E, 0.25, 0.25], [E, 0.5, 0.25]]);
    const ids = [0, 1, 2].map((i) => {
      const t = clockAtBeat(0) + i * 125 + 100; // 100 ms late each time
      const hit = engine.handleInput(on(E, t));
      engine.handleInput(off(E, t + 20));
      return hit?.note.id;
    });
    expect(ids).toEqual([0, 1, 2]);
    expect(engine.getSnapshot(0).counts.great).toBe(3);
  });

  it('accepts a re-strike of a held key when the noteOff was lost', () => {
    const engine = started([[C, 0], [C, 1]]);
    engine.handleInput(on(C, clockAtBeat(0)));
    expect(engine.handleInput(on(C, clockAtBeat(1)))?.judgment).toBe('perfect');
  });

  it('matches simultaneous notes on different pitches independently', () => {
    const engine = started([[C, 0], [E, 0], [G, 0]]);
    expect(engine.handleInput(on(E, clockAtBeat(0) + 10))?.judgment).toBe('perfect');
    expect(engine.handleInput(on(C, clockAtBeat(0) + 70))?.judgment).toBe('great');
    expect(engine.handleInput(on(G, clockAtBeat(0) - 5))?.judgment).toBe('perfect');
    expect(engine.getSnapshot(0).combo).toBe(3);
  });

  it('handles overlapping held notes (legato) without interference', () => {
    const engine = started([[C, 0, 2], [E, 1, 1]]);
    engine.handleInput(on(C, clockAtBeat(0)));
    expect(engine.handleInput(on(E, clockAtBeat(1)))?.judgment).toBe('perfect');
    engine.handleInput(off(C, clockAtBeat(2)));
    engine.handleInput(off(E, clockAtBeat(2)));
    const snap = engine.getSnapshot(clockAtBeat(2));
    expect(snap.notes.map((n) => n.status)).toEqual(['hit', 'hit']);
    expect(snap.notes[0]?.releasedAt).toBe(1000);
    expect(snap.heldNotes.size).toBe(0);
  });

  it('tracks held keys for display', () => {
    const engine = started([[C, 0]]);
    engine.handleInput(on(C, clockAtBeat(0)));
    engine.handleInput(on(G, clockAtBeat(0)));
    expect([...engine.getSnapshot(0).heldNotes].sort()).toEqual([C, G]);
    engine.handleInput(off(C, clockAtBeat(0) + 100));
    expect([...engine.getSnapshot(0).heldNotes]).toEqual([G]);
  });
});

describe('pause and resume', () => {
  it('freezes song time while paused and shifts the timeline by the pause length', () => {
    const engine = started([[C, 0], [D, 4]], { resumeCountdownBeats: 0 });
    engine.handleInput(on(C, clockAtBeat(0)));
    const pauseAt = clockAtBeat(1);
    engine.pause(pauseAt);
    expect(engine.currentState).toBe('paused');
    expect(engine.songTimeAt(pauseAt + 5000)).toBe(engine.songTimeAt(pauseAt));

    const resumeAt = pauseAt + 7000;
    engine.resume(resumeAt);
    expect(engine.currentState).toBe('playing');
    // D at beat 4 is now 7000 ms later on the clock.
    expect(engine.handleInput(on(D, clockAtBeat(4) + 7000))?.judgment).toBe('perfect');
  });

  it('never declares misses while paused', () => {
    const engine = started([[C, 0]]);
    engine.pause(clockAtBeat(0) - 100);
    engine.update(clockAtBeat(0) + 60_000);
    expect(engine.getSnapshot(0).notes[0]?.status).toBe('pending');
  });

  it('settles misses that were due before the pause even if no frame ran', () => {
    const engine = started([[C, 0], [D, 4]]);
    engine.pause(clockAtBeat(2)); // no update() calls at all before pausing
    const snap = engine.getSnapshot(clockAtBeat(2));
    expect(snap.notes[0]?.status).toBe('missed');
    expect(snap.notes[1]?.status).toBe('pending');
  });

  it('ignores input played while paused', () => {
    const engine = started([[C, 0]]);
    engine.pause(clockAtBeat(0) - 1000);
    expect(engine.handleInput(on(C, clockAtBeat(0)))).toBeNull();
    expect(engine.getSnapshot(0).wrongNotes).toBe(0);
  });

  it('runs a frozen resume countdown before continuing', () => {
    const engine = started([[C, 0], [D, 2]]);
    const pauseAt = clockAtBeat(1);
    engine.pause(pauseAt);
    const resumeAt = pauseAt + 3000;
    engine.resume(resumeAt);
    expect(engine.currentState).toBe('resuming');
    const countdown = 3 * 500;
    expect(engine.getSnapshot(resumeAt + 100).resumeRemainingMs).toBe(countdown - 100);
    expect(engine.songTimeAt(resumeAt + 1000)).toBe(engine.songTimeAt(pauseAt));
    // Input during the frozen countdown is ignored.
    expect(engine.handleInput(on(D, resumeAt + 200))).toBeNull();
    engine.update(resumeAt + countdown);
    expect(engine.currentState).toBe('playing');
    const shift = 3000 + countdown;
    expect(engine.handleInput(on(D, clockAtBeat(2) + shift))?.judgment).toBe('perfect');
  });

  it('judges an event timestamped just before the pause even if processed after it', () => {
    const engine = started([[C, 0]]);
    engine.pause(clockAtBeat(0) + 20);
    expect(engine.handleInput(on(C, clockAtBeat(0) + 10))?.judgment).toBe('perfect');
  });

  it('resumes immediately (no extra countdown) when paused during the count-in', () => {
    const engine = started([[C, 0]]);
    engine.pause(START_CLOCK + 500);
    engine.resume(START_CLOCK + 2500);
    expect(engine.currentState).toBe('countdown');
  });

  it('can be paused again during the resume countdown', () => {
    const engine = started([[C, 0]]);
    engine.pause(clockAtBeat(1));
    engine.resume(clockAtBeat(1) + 100);
    engine.pause(clockAtBeat(1) + 200);
    expect(engine.currentState).toBe('paused');
    engine.update(clockAtBeat(1) + 10_000);
    expect(engine.currentState).toBe('paused');
  });
});

describe('state machine, completion and restart', () => {
  it('moves ready → countdown → playing → finished', () => {
    const engine = new GameEngine(makeSong([[C, 0], [D, 1]]));
    const states: string[] = [];
    engine.on((e) => e.type === 'state' && states.push(e.state));
    expect(engine.currentState).toBe('ready');
    engine.start(START_CLOCK);
    engine.update(BEAT0 - 1);
    engine.update(BEAT0);
    engine.handleInput(on(C, clockAtBeat(0)));
    engine.handleInput(on(D, clockAtBeat(1)));
    engine.update(clockAtBeat(2) + 799);
    expect(engine.currentState).toBe('playing');
    engine.update(clockAtBeat(2) + 800);
    expect(states).toEqual(['countdown', 'playing', 'finished']);
  });

  it('produces results on completion', () => {
    const engine = started([[C, 0], [D, 1], [E, 2], [F, 3]]);
    engine.handleInput(on(C, clockAtBeat(0)));
    engine.handleInput(on(D, clockAtBeat(1) + 100));
    engine.handleInput(on(E, clockAtBeat(2) - 200));
    engine.update(clockAtBeat(10));
    expect(engine.currentState).toBe('finished');
    const r = engine.getResults();
    expect(r.counts).toEqual({ perfect: 1, great: 1, good: 1, miss: 1 });
    expect(r.totalNotes).toBe(4);
    expect(r.noteAccuracy).toBe(0.75);
    expect(r.timingAccuracy).toBeCloseTo((1 + 0.75 + 0.4) / 4);
    expect(r.score).toBe(100 + 75 + 40);
    expect(r.maxCombo).toBe(3);
    expect(r.meanOffsetMs).toBeCloseTo(-100 / 3);
    expect(r.stars).toBe(1);
  });

  it('ignores input after the level has finished', () => {
    const engine = started([[C, 0]]);
    engine.update(clockAtBeat(20));
    expect(engine.currentState).toBe('finished');
    expect(engine.handleInput(on(C, clockAtBeat(20)))).toBeNull();
  });

  it('restart resets score, combo, counts and notes, and can be played again', () => {
    const engine = started([[C, 0], [D, 1]]);
    engine.handleInput(on(C, clockAtBeat(0)));
    engine.update(clockAtBeat(5));
    engine.restart();
    expect(engine.currentState).toBe('ready');
    let snap = engine.getSnapshot(0);
    expect(snap.score).toBe(0);
    expect(snap.combo).toBe(0);
    expect(snap.maxCombo).toBe(0);
    expect(snap.counts).toEqual({ perfect: 0, great: 0, good: 0, miss: 0 });
    expect(snap.notes.every((n) => n.status === 'pending' && n.judgment === null)).toBe(true);
    // Inputs while ready are ignored.
    expect(engine.handleInput(on(C, 99_000))).toBeNull();
    engine.handleInput(off(C, 99_100));

    const t0 = 100_000;
    engine.start(t0);
    expect(engine.handleInput(on(C, t0 + 2000))?.judgment).toBe('perfect');
    expect(engine.handleInput(on(D, t0 + 2500))?.judgment).toBe('perfect');
    snap = engine.getSnapshot(t0 + 2500);
    expect(snap.score).toBe(200);
    expect(snap.combo).toBe(2);
  });

  it('restart works from a paused state mid-song', () => {
    const engine = started([[C, 0]]);
    engine.pause(clockAtBeat(0) - 500);
    engine.restart();
    engine.start(50_000);
    expect(engine.currentState).toBe('countdown');
    expect(engine.handleInput(on(C, 52_000))?.judgment).toBe('perfect');
  });
});

describe('scoring', () => {
  it('caps the combo multiplier', () => {
    expect(comboMultiplier(0, DEFAULT_SCORING)).toBe(1);
    expect(comboMultiplier(9, DEFAULT_SCORING)).toBe(1);
    expect(comboMultiplier(10, DEFAULT_SCORING)).toBeCloseTo(1.1);
    expect(comboMultiplier(49, DEFAULT_SCORING)).toBeCloseTo(1.4);
    expect(comboMultiplier(50, DEFAULT_SCORING)).toBeCloseTo(1.5);
    expect(comboMultiplier(10_000, DEFAULT_SCORING)).toBeCloseTo(1.5);
  });

  it('applies the combo multiplier from the combo before each hit', () => {
    const notes = Array.from({ length: 12 }, (_, i) => [C, i * 0.5, 0.5] as [number, number, number]);
    const engine = started(notes);
    for (let i = 0; i < 12; i++) {
      const [a, b] = tap(C, clockAtBeat(i * 0.5), 50);
      engine.handleInput(a);
      engine.handleInput(b);
    }
    // 10 hits at x1.0, then hits 11 and 12 at x1.1
    expect(engine.getSnapshot(0).score).toBe(10 * 100 + 2 * 110);
  });
});

describe('frame-rate independence', () => {
  // A realistic performance: a mix of perfect, early, late, wrong and skipped notes.
  const song = makeSong([
    [C, 0], [E, 1], [G, 2, 2], [F, 4, 0.5], [E, 4.5, 0.5], [D, 5], [D, 6], [C, 7, 0.25], [C, 7.25, 0.25],
    [E, 8], [G, 8], [F, 9], [E, 10], [D, 11], [C, 12, 2],
  ]);
  const performance: Array<[note: number, beat: number, offsetMs: number]> = [
    [C, 0, 0], [E, 1, 45], [G, 2, -120], [F, 4, 90], [E, 4.5, -30], [D, 5, 210], /* skip D@6 */
    [C, 7, 10], [C, 7.25, 75], [E, 8, -15], [G, 8, 140], [D, 9, 0] /* wrong */, [E, 10, -250] /* too early */,
    [D, 11, 5], [C, 12, -60],
  ];

  function run(frameTimes: (end: number) => number[], deliveryDelayMs: number) {
    const engine = new GameEngine(song);
    engine.start(START_CLOCK);
    const events = performance
      .flatMap(([note, beat, offset]) => tap(note, clockAtBeat(beat) + offset, 70))
      .sort((a, b) => a.time - b.time);
    const end = clockAtBeat(20);
    const frames = frameTimes(end);
    // Interleave frames and event deliveries by wall-clock delivery time.
    type Item = { at: number; kind: 0 | 1; i: number };
    const items: Item[] = [
      ...frames.map((at, i) => ({ at, kind: 0 as const, i })),
      ...events.map((e, i) => ({ at: e.time + deliveryDelayMs, kind: 1 as const, i })),
    ].sort((a, b) => a.at - b.at || b.kind - a.kind);
    for (const item of items) {
      if (item.kind === 0) engine.update(item.at);
      else engine.handleInput(events[item.i]!);
    }
    engine.update(end);
    return { results: engine.getResults(), notes: engine.getSnapshot(end).notes.map((n) => [n.status, n.judgment, n.offsetMs]) };
  }

  const every = (step: number) => (end: number) => {
    const out: number[] = [];
    for (let t = START_CLOCK; t <= end; t += step) out.push(t);
    return out;
  };
  const jittery = (end: number) => {
    // Deterministic pseudo-random frame gaps between 1 and 120 ms.
    const out: number[] = [];
    let seed = 42;
    for (let t = START_CLOCK; t <= end; ) {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      t += 1 + (seed % 120);
      out.push(t);
    }
    return out;
  };

  it('produces identical results at 1000, 144, 60, 30 and 10 FPS, jittery frames, and no frames', () => {
    const baseline = run(every(1), 0);
    expect(baseline.results.counts.miss).toBeGreaterThan(0);
    expect(baseline.results.wrongNotes).toBeGreaterThan(0);
    for (const frames of [every(1000 / 144), every(1000 / 60), every(1000 / 30), every(100), jittery, () => []]) {
      for (const delay of [0, 8, 25]) {
        expect(run(frames, delay)).toEqual(baseline);
      }
    }
  });
});
