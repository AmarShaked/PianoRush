import { describe, expect, it } from 'vitest';
import { parseSmf, SmfError } from './smf';
import { writeSmf } from './smfWriter';

describe('parseSmf', () => {
  const file = writeSmf(
    [
      { name: 'Melody', notes: [{ tick: 0, durationTicks: 480, midi: 64 }, { tick: 480, durationTicks: 240, midi: 62 }] },
      { name: 'Piano LH', notes: [{ tick: 0, durationTicks: 1920, midi: 48, channel: 1 }, { tick: 0, durationTicks: 1920, midi: 55, channel: 1 }] },
    ],
    { bpm: 96, timeSignature: [3, 4] },
  );

  it('reads header, tempo and time signature', () => {
    const smf = parseSmf(file);
    expect(smf.format).toBe(1);
    expect(smf.ticksPerQuarter).toBe(480);
    expect(Math.round(60_000_000 / smf.tempos[0]!.usPerQuarter)).toBe(96);
    expect(smf.timeSignatures[0]).toMatchObject({ numerator: 3, denominator: 4 });
  });

  it('pairs note on/off into notes per track, with names and channels', () => {
    const smf = parseSmf(file);
    const tracks = smf.tracks.filter((t) => t.notes.length);
    expect(tracks.map((t) => t.name)).toEqual(['Melody', 'Piano LH']);
    expect(tracks[0]!.notes.map((n) => [n.tick, n.durationTicks, n.midi])).toEqual([[0, 480, 64], [480, 240, 62]]);
    expect(tracks[1]!.channels).toEqual([1]);
  });

  it('handles running status and velocity-0 note-offs', () => {
    const smf = parseSmf(writeSmf([{ notes: [{ tick: 0, durationTicks: 100, midi: 60 }, { tick: 100, durationTicks: 100, midi: 62 }] }], { runningStatus: true }));
    expect(smf.tracks[1]!.notes.map((n) => [n.tick, n.durationTicks, n.midi])).toEqual([[0, 100, 60], [100, 100, 62]]);
  });

  it('rejects non-MIDI data and SMPTE timing with a clear error', () => {
    expect(() => parseSmf(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(SmfError);
    const smpte = writeSmf([]);
    smpte[12] = 0xe7;
    expect(() => parseSmf(smpte)).toThrow(/SMPTE/);
  });
});
