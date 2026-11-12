import { describe, expect, it } from 'vitest';
import { Looper } from './Looper';
import { drumFor, partFor } from './instruments';

/** 120 BPM: 500 ms per beat, 2 s per bar. The transport starts 80 ms after the tap that starts it. */
function setup(bars: 1 | 2 | 4 | 8 | 'free' = 1) {
  const looper = new Looper();
  looper.bpm = 120;
  looper.loopBars = bars;
  looper.snap = 0;
  return looper;
}
const T0 = 1000; // tap time
const beatMs = (looper: Looper, beat: number) => looper.msAt(beat);

/** Play a note at `beat` lasting `beats`. */
function play(looper: Looper, midi: number, beat: number, beats = 0.5, instrument: 'drums' | 'bass' = 'drums') {
  looper.noteOn(midi, 100, beatMs(looper, beat), instrument);
  looper.noteOff(midi, beatMs(looper, beat + beats));
}

/** Beats of the notes due in [fromBeat, toBeat). */
function due(looper: Looper, fromBeat: number, toBeat: number) {
  looper.update(beatMs(looper, fromBeat));
  return looper.collect(beatMs(looper, fromBeat), beatMs(looper, toBeat)).notes.map((n) => ({ beat: looper.beatAt(n.timeMs), midi: n.midi }));
}

describe('Looper', () => {
  it('counts in one bar, records the next bar, then loops it', () => {
    const looper = setup(1);
    looper.tap(0, T0, 'drums');
    expect(looper.running).toBe(true);
    expect(looper.beatAt(T0 + 80)).toBeCloseTo(0);
    // Count-in: clicks on beats 0..3 even with the metronome off.
    looper.metronome = false;
    const clicks = looper.collect(beatMs(looper, 0), beatMs(looper, 6)).clicks;
    expect(clicks.map((c) => Math.round(looper.beatAt(c.timeMs)))).toEqual([0, 1, 2, 3]);
    expect(clicks[0]!.accent).toBe(true);

    expect(looper.views(beatMs(looper, 2))[0]!.state).toBe('waiting');
    expect(looper.views(beatMs(looper, 2))[0]!.startsIn).toBeCloseTo(2);
    play(looper, 36, 4); // kick on beat 1 of the loop
    play(looper, 38, 6); // snare on beat 3
    expect(looper.views(beatMs(looper, 5))[0]!.state).toBe('recording');

    // Not replayed during the recording pass (you just heard it live).
    expect(due(looper, 4, 8)).toEqual([]);
    // Then every bar.
    expect(looper.views(beatMs(looper, 8))[0]!.state).toBe('playing');
    expect(due(looper, 8, 16)).toEqual([
      { beat: 8, midi: 36 },
      { beat: 10, midi: 38 },
      { beat: 12, midi: 36 },
      { beat: 14, midi: 38 },
    ]);
  });

  it('pulls a slightly early first note onto beat 1, and snaps to the grid', () => {
    const looper = setup(1);
    looper.snap = 0.25;
    looper.tap(0, T0, 'drums');
    play(looper, 36, 3.8); // early for the downbeat
    play(looper, 42, 5.13); // a little late for beat 2 + 1/8
    const notes = due(looper, 8, 12);
    expect(notes.map((n) => n.beat)).toEqual([8, 9.25]);
  });

  it('records a note held across the end as one long note', () => {
    const looper = setup(1);
    looper.tap(0, T0, 'bass');
    looper.noteOn(40, 90, beatMs(looper, 6), 'bass');
    looper.noteOff(40, beatMs(looper, 9));
    looper.update(beatMs(looper, 9));
    const n = looper.collect(beatMs(looper, 8), beatMs(looper, 12)).notes[0]!;
    expect(looper.beatAt(n.timeMs)).toBeCloseTo(10);
    expect(n.durationMs).toBeCloseTo(3 * 500);
  });

  it('gives the slot back when nothing was played', () => {
    const looper = setup(1);
    looper.tap(0, T0, 'drums');
    looper.update(beatMs(looper, 8.1));
    expect(looper.views(beatMs(looper, 8.1))[0]!.state).toBe('empty');
  });

  it('free length: tapping again closes the loop on the nearest bar line', () => {
    const looper = setup('free');
    looper.tap(0, T0, 'drums');
    play(looper, 36, 4);
    play(looper, 36, 8);
    play(looper, 36, 12);
    // Tap just after the third bar line (beat 4 + 12.3): a 3-bar loop.
    looper.tap(0, beatMs(looper, 16.3), 'drums');
    const v = looper.views(beatMs(looper, 16.4))[0]!;
    expect(v.bars).toBe(3);
    expect(v.state).toBe('playing');
    expect(due(looper, 16, 28).map((n) => n.beat)).toEqual([16, 20, 24]);
  });

  it('free length: tapping before a bar line closes on the next one', () => {
    const looper = setup('free');
    looper.tap(0, T0, 'drums');
    play(looper, 36, 4);
    looper.tap(0, beatMs(looper, 9), 'drums'); // 1¼ bars in
    expect(looper.views(beatMs(looper, 9))[0]!.bars).toBe(2);
    expect(looper.views(beatMs(looper, 9))[0]!.state).toBe('recording'); // until the bar line
    expect(due(looper, 12, 28).map((n) => n.beat)).toEqual([12, 20]);
  });

  it('mutes and unmutes a loop', () => {
    const looper = setup(1);
    looper.tap(0, T0, 'drums');
    play(looper, 36, 4);
    looper.tap(0, beatMs(looper, 9), 'drums');
    expect(looper.views(beatMs(looper, 9))[0]!.state).toBe('muted');
    expect(due(looper, 12, 16)).toEqual([]);
    looper.tap(0, beatMs(looper, 13), 'drums');
    expect(due(looper, 16, 20)).toEqual([{ beat: 16, midi: 36 }]);
  });

  it('keeps loops of different lengths in step', () => {
    const looper = setup(1);
    looper.tap(0, T0, 'drums'); // 1-bar drums from beat 4
    play(looper, 36, 4);
    looper.loopBars = 2;
    looper.update(beatMs(looper, 9));
    looper.tap(1, beatMs(looper, 9), 'bass'); // armed for the next bar line: beat 12
    expect(looper.views(beatMs(looper, 9))[1]!.state).toBe('waiting');
    play(looper, 40, 12, 1, 'bass');
    play(looper, 43, 16, 1, 'bass');
    const notes = due(looper, 20, 28);
    expect(notes).toEqual([
      { beat: 20, midi: 36 },
      { beat: 20, midi: 40 },
      { beat: 24, midi: 36 },
      { beat: 24, midi: 43 },
    ]);
  });

  it('chains: tapping a new slot while recording ends the first and starts the second there', () => {
    const looper = setup('free');
    looper.tap(0, T0, 'drums');
    play(looper, 36, 4);
    looper.tap(1, beatMs(looper, 7.5), 'bass'); // 3½ beats in: slot 0 closes at beat 8
    const v = looper.views(beatMs(looper, 7.6));
    expect(v[0]!.bars).toBe(1);
    expect(v[1]!.state).toBe('waiting');
    play(looper, 40, 8, 1, 'bass');
    looper.tap(1, beatMs(looper, 12.1), 'bass'); // close slot 1 after one bar
    expect(due(looper, 12, 16)).toEqual([
      { beat: 12, midi: 36 },
      { beat: 12, midi: 40 },
    ]);
  });

  it('gives a note just before a bar line to the loop starting there, not the one ending', () => {
    const looper = setup(1);
    looper.tap(0, T0, 'drums'); // records beats 4..8
    play(looper, 36, 4);
    looper.tap(1, beatMs(looper, 6), 'bass'); // armed for beat 8
    play(looper, 40, 7.9, 1, 'bass'); // a touch early for the bass loop's first beat
    expect(looper.views(beatMs(looper, 9))[0]!.notes).toBe(1);
    expect(looper.views(beatMs(looper, 9))[1]!.notes).toBe(1);
  });

  it('adds a layer with overdub and takes it away with undo', () => {
    const looper = setup(1);
    looper.tap(0, T0, 'drums');
    play(looper, 36, 4);
    looper.update(beatMs(looper, 8));
    looper.overdub(0, beatMs(looper, 8));
    play(looper, 42, 9);
    expect(looper.views(beatMs(looper, 10))[0]!.overdubbing).toBe(true);
    // The new hat isn't doubled on the pass it was played in, then joins the loop.
    expect(due(looper, 8, 12)).toEqual([{ beat: 8, midi: 36 }]);
    expect(due(looper, 12, 16)).toEqual([
      { beat: 12, midi: 36 },
      { beat: 13, midi: 42 },
    ]);
    expect(looper.views(beatMs(looper, 12))[0]!.overdubbing).toBe(false);
    expect(looper.views(beatMs(looper, 12))[0]!.layers).toBe(2);
    looper.undo(0);
    expect(due(looper, 16, 20)).toEqual([{ beat: 16, midi: 36 }]);
    looper.undo(0);
    expect(looper.views(beatMs(looper, 20))[0]!.state).toBe('empty');
  });

  it('changes tempo without jumping', () => {
    const looper = setup(1);
    looper.tap(0, T0, 'drums');
    play(looper, 36, 4);
    const now = beatMs(looper, 10.5);
    looper.setBpm(60, now);
    expect(looper.beatAt(now)).toBeCloseTo(10.5);
    expect(looper.msPerBeat).toBe(1000);
    const n = looper.collect(now, now + 2000).notes;
    expect(n).toHaveLength(1);
    expect(n[0]!.timeMs).toBeCloseTo(now + 1500);
  });

  it('stop drops an unfinished recording; play starts every loop from the top', () => {
    const looper = setup(1);
    looper.tap(0, T0, 'drums');
    play(looper, 36, 4);
    play(looper, 38, 6);
    looper.update(beatMs(looper, 9));
    looper.tap(1, beatMs(looper, 9), 'bass');
    looper.stop();
    expect(looper.running).toBe(false);
    const v = looper.views(0);
    expect(v[0]!.state).toBe('playing');
    expect(v[1]!.state).toBe('empty');
    looper.start(50_000);
    expect(due(looper, 0, 4)).toEqual([
      { beat: 0, midi: 36 },
      { beat: 2, midi: 38 },
    ]);
  });

  it('saves and restores the loops', () => {
    const looper = setup(2);
    looper.tap(3, T0, 'bass');
    play(looper, 40, 4, 2, 'bass');
    looper.update(beatMs(looper, 12));
    const copy = new Looper();
    copy.restore(JSON.parse(JSON.stringify(looper.snapshot())));
    expect(copy.bpm).toBe(120);
    expect(copy.views(0)[3]).toMatchObject({ state: 'playing', instrument: 'bass', bars: 2, notes: 1 });
    copy.start(0);
    const n = copy.collect(copy.msAt(0), copy.msAt(8)).notes;
    expect(n.map((x) => [copy.beatAt(x.timeMs), x.midi, x.durationMs])).toEqual([[0, 40, 1000]]);
  });

  it('keeps the metronome on the beat when asked', () => {
    const looper = setup(1);
    looper.start(0);
    looper.metronome = true;
    const clicks = looper.collect(looper.msAt(0), looper.msAt(8)).clicks;
    expect(clicks.map((c) => c.accent)).toEqual([true, false, false, false, true, false, false, false]);
    looper.metronome = false;
    expect(looper.collect(looper.msAt(0), looper.msAt(8)).clicks).toEqual([]);
  });
});

describe('Loop Studio instruments', () => {
  it('maps the drum kit by note name, following General MIDI pads', () => {
    expect(drumFor(36)).toBe('kick');
    expect(drumFor(48)).toBe('kick'); // any octave
    expect(drumFor(38)).toBe('snare');
    expect(drumFor(42)).toBe('hat');
    expect(drumFor(46)).toBe('openhat');
    expect(drumFor(39)).toBe('clap');
    expect(drumFor(71)).toBe('crash');
    expect(partFor('drums', 41)).toEqual({ part: 'tom', midi: 45 });
  });

  it('plays bass an octave down and the piano on the piano voice', () => {
    expect(partFor('bass', 48)).toEqual({ part: 'bass', midi: 36 });
    expect(partFor('piano', 60)).toEqual({ part: 'melody', midi: 60 });
  });
});
