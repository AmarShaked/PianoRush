import { describe, expect, it } from 'vitest';
import { parseSmf } from './smf';
import { writeSmf, type WriterNote } from './smfWriter';
import { estimateKey, inferChords, midiToSong, suggestMelodyTrack, summarizeTracks } from './convert';
import { compileSong } from '../compile';

const Q = 480; // ticks per quarter
const n = (beat: number, beats: number, midi: number, channel = 0): WriterNote => ({ tick: Math.round(beat * Q), durationTicks: Math.round(beats * Q), midi, channel });

/** A small test arrangement: melody (with harmony notes under it), block-chord accompaniment, drums. */
function fixture(opts: { meter?: [number, number]; melodyOctave?: number } = {}) {
  const o = opts.melodyOctave ?? 0;
  const melody = [
    n(0, 1, 76 + o), n(0, 1, 72 + o), // top line E5 with a harmony note C5 underneath
    n(1, 1, 74 + o), n(2.03, 0.98, 72 + o), n(3, 1, 74 + o), // slightly off-grid onset
    n(4, 2, 71 + o), n(6, 2, 74 + o),
    n(8, 1, 72 + o), n(9, 1, 76 + o), n(10, 2, 72 + o),
    n(12, 4, 72 + o),
  ];
  const chordAt = (beat: number, pcs: number[]) => pcs.map((p) => n(beat, 4, p, 1));
  const accompaniment = [
    ...chordAt(0, [48, 52, 55]), // C
    ...chordAt(4, [43, 47, 50]), // G
    ...chordAt(8, [45, 48, 52]), // Am
    ...chordAt(12, [41, 45, 48]), // F
  ];
  const drums = [0, 1, 2, 3].map((b) => n(b, 0.5, 36, 9));
  return parseSmf(
    writeSmf(
      [
        { name: 'Accompaniment', notes: accompaniment },
        { name: 'Melody', notes: melody },
        { name: 'Drums', notes: drums },
      ],
      { bpm: 100, timeSignature: opts.meter ?? [4, 4] },
    ),
  );
}

describe('track analysis', () => {
  it('summarizes tracks and spots drums', () => {
    const t = summarizeTracks(fixture());
    expect(t.map((x) => [x.name, x.isDrums])).toEqual([['Accompaniment', false], ['Melody', false], ['Drums', true]]);
    expect(t[0]!.chordiness).toBe(1);
  });
  it('suggests the melody track (by name, else highest single line)', () => {
    const smf = fixture();
    expect(smf.tracks[suggestMelodyTrack(smf)!]!.name).toBe('Melody');
  });
});

describe('estimateKey', () => {
  const scale = (pcs: number[], base = 60) => pcs.map((pc, i) => ({ start: i, end: i + 1, midi: base + pc }));
  it('recognises keys and chooses sharps or flats', () => {
    expect(estimateKey(scale([0, 2, 4, 5, 7, 9, 11, 0, 4, 7, 0]))).toMatchObject({ name: 'C major', flats: false });
    expect(estimateKey(scale([6, 8, 9, 11, 1, 2, 4, 6, 9, 1, 6, 6]))).toMatchObject({ name: 'F# minor', flats: false });
    expect(estimateKey(scale([5, 7, 9, 10, 0, 2, 4, 5, 9, 0, 5, 5]))).toMatchObject({ name: 'F major', flats: true });
  });
});

describe('format-0 files', () => {
  it('split a multi-channel track into one track per channel', () => {
    const smf = parseSmf(writeSmf([{ name: 'All', notes: [n(0, 1, 72, 0), n(0, 4, 48, 1), n(1, 1, 74, 0), n(0, 0.5, 36, 9)] }]));
    expect(smf.tracks.filter((t) => t.notes.length).map((t) => t.name)).toEqual(['All · ch 1', 'All · ch 2', 'All · ch 10 (drums)']);
  });
});

describe('inferChords', () => {
  it('finds triads from the accompaniment', () => {
    const acc = [
      { start: 0, end: 2, midi: 48 }, { start: 0, end: 2, midi: 52 }, { start: 0, end: 2, midi: 55 },
      { start: 2, end: 4, midi: 45 }, { start: 2, end: 4, midi: 48 }, { start: 2, end: 4, midi: 52 },
      { start: 4, end: 6, midi: 50 }, { start: 4, end: 6, midi: 53 }, { start: 4, end: 6, midi: 57 },
    ];
    expect(inferChords(acc, [], 6, 2)).toEqual([[0, 'C'], [2, 'Am'], [4, 'Dm']]);
  });
});

describe('midiToSong', () => {
  const base = { id: 'test-import', title: 'Imported', credit: 'Licensed · test', hand: 'right' as const };

  it('keeps the top line, snaps to the grid, infers chords and plays in a comfortable range', () => {
    const smf = fixture();
    const melodyTrack = suggestMelodyTrack(smf)!;
    const { song, stats, warnings } = midiToSong(smf, { ...base, playerTracks: [melodyTrack] });
    expect(warnings).toEqual([]);
    expect(song.bpm).toBe(100);
    expect(song.backing!.chords).toEqual([[0, 'C'], [4, 'G'], [8, 'Am'], [12, 'F']]);
    // Auto octave: E5-centred melody moves down an octave around C4–E4.
    expect(stats.transpose).toBe(-12);
    expect(song.notes.map((x) => [x.midi, x.startBeat])).toEqual([
      [64, 0], [62, 1], [60, 2], [62, 3], [59, 4], [62, 6], [60, 8], [64, 9], [60, 10], [60, 12],
    ]);
    expect(song.notes.every((x) => x.hand === 'right')).toBe(true);
    expect(() => compileSong(song)).not.toThrow();
  });

  it('keeps chords when asked (up to three per hand)', () => {
    const smf = fixture();
    const { song } = midiToSong(smf, { ...base, playerTracks: [suggestMelodyTrack(smf)!], keepChords: true });
    expect(song.notes.filter((x) => x.startBeat === 0)).toHaveLength(2);
  });

  it('imports a bar range, shifted to bar 1', () => {
    const smf = fixture();
    const { song, stats } = midiToSong(smf, { ...base, playerTracks: [suggestMelodyTrack(smf)!], fromBar: 2, toBar: 3 });
    expect(stats.bars).toBe(2);
    expect(song.notes[0]!.startBeat).toBe(0);
    expect(song.backing!.chords).toEqual([[0, 'G'], [4, 'Am']]);
  });

  it('splits both hands at middle C and plays the accompaniment as the left hand', () => {
    const smf = fixture();
    const { song } = midiToSong(smf, { ...base, playerTracks: [1, 2], hand: 'both', transpose: 0 });
    expect(song.notes.some((x) => x.hand === 'left' && x.midi < 60)).toBe(true);
    expect(song.notes.some((x) => x.hand === 'right' && x.midi >= 60)).toBe(true);
  });

  it('maps 3/4 and 6/8 to the game meter', () => {
    expect(midiToSong(fixture({ meter: [3, 4] }), { ...base, playerTracks: [2] }).song.timeSignature).toEqual([3, 4]);
    expect(midiToSong(fixture({ meter: [6, 8] }), { ...base, playerTracks: [2] }).song.timeSignature).toEqual([3, 4]);
  });

  it('warns about notes outside the computer-keyboard range', () => {
    const smf = fixture();
    const { warnings } = midiToSong(smf, { ...base, playerTracks: [2], transpose: 24 });
    expect(warnings.join(' ')).toMatch(/outside the computer-keyboard range/);
  });

  it('carries a recorded backing reference', () => {
    const { song } = midiToSong(fixture(), { ...base, playerTracks: [2], audio: { url: 'blob:x', offsetMs: 1200 } });
    expect(song.backing!.audio).toEqual({ url: 'blob:x', offsetMs: 1200 });
  });
});
