import { describe, expect, it } from 'vitest';
import { ACCOMPANIMENT_CEILING, arrange, bassRoot, padVoicing, type BackingNote } from './arranger';
import { notesInWindow, notesSoundingAt } from './schedule';
import { compileSong } from '../song-content/compile';
import { chordAt, parseChord } from '../song-content/chords';
import { HITS, WORLD_1 } from '../song-content';
import { SONG_SCHEMA_VERSION, type BackingStyle } from '../song-content/schema';

function song(style: BackingStyle, chords: [number, string][] = [[0, 'C'], [4, 'F'], [8, 'G7'], [12, 'C']]) {
  return compileSong({
    schemaVersion: SONG_SCHEMA_VERSION, id: 't', title: 't', composer: 't', bpm: 120, timeSignature: [4, 4], countInBeats: 4,
    lanes: [60, 62, 64, 65, 67],
    notes: [0, 4, 8, 12].map((b) => ({ midi: 60, startBeat: b, durationBeats: 1 })),
    backing: { style, chords },
  });
}
const count = (notes: BackingNote[], part: BackingNote['part'], from = 0, to = Infinity) =>
  notes.filter((n) => n.part === part && n.beat >= from && n.beat < to).length;

describe('arrange', () => {
  it('is deterministic and sorted by beat', () => {
    const a = arrange(song('groove'));
    expect(arrange(song('groove'))).toEqual(a);
    expect(a.every((n, i) => i === 0 || a[i - 1]!.beat <= n.beat)).toBe(true);
  });

  it('starts with an accented 4-beat count-in', () => {
    const clicks = arrange(song('straight')).filter((n) => n.part === 'click');
    expect(clicks.map((c) => [c.beat, c.accent])).toEqual([[-4, true], [-3, false], [-2, false], [-1, false]]);
  });

  it('adds a click on every beat (accented bar starts) when the metronome is on', () => {
    const notes = arrange(song('straight'), { metronome: true });
    expect(count(notes, 'click', 0)).toBe(16);
    expect(notes.filter((n) => n.part === 'click' && n.beat >= 0 && n.accent).map((n) => n.beat)).toEqual([0, 4, 8, 12]);
  });

  it('keeps the band out of the player\'s register for low (left-hand) and wide (two-hand) songs', () => {
    for (const lanes of [[48, 50, 52, 53, 55], [48, 50, 52, 53, 55, 60, 62, 64, 65, 67], [59, 60, 62, 64, 65, 67, 69]]) {
      for (const style of ['gentle', 'straight', 'groove', 'pop', 'dance', 'waltz'] as const) {
        const s = compileSong({ ...song(style).definition, lanes, notes: lanes.map((m, i) => ({ midi: m, startBeat: i, durationBeats: 1 })) });
        const pitched = arrange(s).filter((n) => n.midi !== undefined);
        const lo = Math.min(...lanes);
        const hi = Math.max(...lanes);
        expect(pitched.filter((n) => n.midi! >= lo && n.midi! <= hi)).toEqual([]);
      }
    }
  });

  it('plays a lead melody above the player and drops omitted parts', () => {
    const base = song('pop').definition;
    const s = compileSong({
      ...base,
      backing: { ...base.backing!, lead: [{ midi: 64, startBeat: 0, durationBeats: 1 }, { midi: 67, startBeat: 1, durationBeats: 1 }], omit: ['bass'] },
    });
    const notes = arrange(s);
    expect(notes.filter((n) => n.part === 'lead').map((n) => n.midi)).toEqual([76, 79]);
    expect(notes.filter((n) => n.part === 'bass' || n.part === 'synthbass')).toEqual([]);
    expect(notes.filter((n) => n.part === 'pad')).toEqual([]); // the lead replaces the pads
  });

  it('never plays in the melody register (no pitched part reaches middle C)', () => {
    for (const style of ['gentle', 'straight', 'groove', 'pop', 'dance', 'waltz'] as const) {
      const pitched = arrange(song(style)).filter((n) => n.midi !== undefined);
      expect(pitched.length).toBeGreaterThan(0);
      expect(Math.max(...pitched.map((n) => n.midi!))).toBeLessThanOrEqual(ACCOMPANIMENT_CEILING);
    }
  });

  it('plays the chord root in the bass on every bar start', () => {
    const s = song('straight');
    const notes = arrange(s);
    for (const bar of [0, 4, 8, 12]) {
      const bass = notes.find((n) => n.part === 'bass' && n.beat === bar)!;
      expect(bass.midi).toBe(bassRoot(parseChord(chordAt(s.definition.backing!.chords, bar)!)!));
    }
  });

  it('straight: kick on 1 & 3, snare on 2 & 4, eighth-note hats', () => {
    const notes = arrange(song('straight'));
    const bar = notes.filter((n) => n.beat >= 4 && n.beat < 8);
    expect(bar.filter((n) => n.part === 'kick').map((n) => n.beat)).toEqual([4, 6]);
    expect(bar.filter((n) => n.part === 'snare').map((n) => n.beat)).toEqual([5, 7]);
    expect(bar.filter((n) => n.part === 'hat')).toHaveLength(8);
  });

  it('gentle: no snare, a broken-chord arpeggio from the chord tones', () => {
    const notes = arrange(song('gentle'));
    expect(count(notes, 'snare')).toBe(0);
    const arp = notes.filter((n) => n.part === 'keys' && n.beat >= 4 && n.beat < 8).map((n) => n.midi);
    const f = padVoicing(parseChord('F')!); // [48 C, 53 F, 57 A]
    expect(arp).toEqual([f[0], f[1], f[2], f[1]]);
  });

  it('groove: syncopated kick and off-beat chord stabs', () => {
    const notes = arrange(song('groove'));
    expect(notes.filter((n) => n.part === 'kick' && n.beat >= 4 && n.beat < 8).map((n) => n.beat)).toEqual([4, 5.5, 6]);
    expect(notes.filter((n) => n.part === 'keys' && n.beat >= 4 && n.beat < 8).map((n) => n.beat)).toEqual([4.5, 4.5, 4.5, 6.5, 6.5, 6.5]);
  });

  it('dance: four-on-the-floor kick, claps on 2 & 4, off-beat open hats and synth bass', () => {
    const bar = arrange(song('dance')).filter((n) => n.beat >= 4 && n.beat < 8);
    expect(bar.filter((n) => n.part === 'kick').map((n) => n.beat)).toEqual([4, 5, 6, 7]);
    expect(bar.filter((n) => n.part === 'clap').map((n) => n.beat)).toEqual([5, 7]);
    expect(bar.filter((n) => n.part === 'openhat').map((n) => n.beat)).toEqual([4.5, 5.5, 6.5, 7.5]);
    expect(bar.filter((n) => n.part === 'synthbass').map((n) => n.beat)).toEqual([4.5, 5.5, 6.5, 7.5]);
  });

  it('pop: kick 1, and-of-2, 3; backbeat on 2 & 4; eighth-note bass', () => {
    const bar = arrange(song('pop')).filter((n) => n.beat >= 4 && n.beat < 8);
    expect(bar.filter((n) => n.part === 'kick').map((n) => n.beat)).toEqual([4, 5.5, 6]);
    expect(bar.filter((n) => n.part === 'clap').map((n) => n.beat)).toEqual([5, 7]);
    expect(bar.filter((n) => n.part === 'bass')).toHaveLength(8);
  });

  it('energetic styles crash on each 4-bar phrase and roll into the next one', () => {
    const notes = arrange(compileSong({ ...song('dance').definition, notes: [0, 8, 16, 24, 31].map((b) => ({ midi: 60, startBeat: b, durationBeats: 1 })) }));
    expect(notes.filter((n) => n.part === 'crash').map((n) => n.beat)).toEqual([0, 16, 28]);
    const roll = notes.filter((n) => n.part === 'snare' && n.beat >= 15 && n.beat < 16);
    expect(roll.map((n) => n.beat)).toEqual([15, 15.25, 15.5, 15.75]);
    expect(roll.map((n) => n.velocity)).toEqual([...roll.map((n) => n.velocity)].sort((a, b) => a - b));
  });

  it('waltz (3/4): bass + kick on 1, chords on 2 and 3, a 3-beat bar', () => {
    const waltz = compileSong({
      ...song('waltz').definition,
      timeSignature: [3, 4],
      countInBeats: 6,
      notes: [0, 3, 6, 9, 12].map((b) => ({ midi: 60, startBeat: b, durationBeats: 1 })),
      backing: { style: 'waltz', chords: [[0, 'C'], [3, 'F'], [6, 'G7'], [9, 'C']] },
    });
    const notes = arrange(waltz);
    const bar = notes.filter((n) => n.beat >= 3 && n.beat < 6);
    expect(bar.filter((n) => n.part === 'kick').map((n) => n.beat)).toEqual([3]);
    expect(bar.filter((n) => n.part === 'bass').map((n) => [n.beat, n.midi])).toEqual([[3, bassRoot(parseChord('F')!)]]);
    expect([...new Set(bar.filter((n) => n.part === 'keys').map((n) => n.beat))]).toEqual([4, 5]);
    // Count-in of two 3/4 bars, accented on each bar start.
    expect(notes.filter((n) => n.part === 'click').map((n) => n.accent)).toEqual([true, false, false, true, false, false]);
    expect(count(notes, 'snare')).toBe(0);
  });

  it('ends with one hit and the final chord held to the end of the last bar', () => {
    const notes = arrange(song('groove'));
    const last = notes.filter((n) => n.beat >= 12);
    expect(last.filter((n) => n.part === 'kick')).toHaveLength(1);
    expect(last.filter((n) => n.part === 'hat' || n.part === 'snare')).toHaveLength(0);
    expect(last.filter((n) => n.part === 'pad').map((n) => [n.midi, n.durationBeats])).toEqual(padVoicing(parseChord('C')!).map((m) => [m, 4]));
  });

  it('a song without a backing spec only gets the count-in', () => {
    const s = compileSong({ ...song('straight').definition, backing: undefined });
    expect(arrange(s).every((n) => n.part === 'click')).toBe(true);
  });

  it.each([...WORLD_1.levels, ...HITS.levels].map((l) => [l.id, l] as const))('%s has bass in every bar', (_, level) => {
    const s = compileSong(level.song);
    const notes = arrange(s);
    const bpb = level.song.timeSignature[0];
    const bars = Math.ceil(s.totalBeats / bpb);
    for (let bar = 0; bar < bars; bar++) {
      expect(notes.some((n) => (n.part === 'bass' || n.part === 'synthbass') && n.beat >= bar * bpb && n.beat < (bar + 1) * bpb)).toBe(true);
    }
  });
});

describe('scheduling windows', () => {
  const notes = arrange(song('straight'));

  it('consecutive windows cover every note exactly once', () => {
    const seen: BackingNote[] = [];
    let from = -10;
    for (const step of [0.37, 1.1, 0.05, 2.5, 0.8, 3, 7, 20]) {
      seen.push(...notesInWindow(notes, from, from + step));
      from += step;
    }
    expect(seen).toEqual(notes.filter((n) => n.beat >= -10 && n.beat < from));
    expect(seen).toHaveLength(notes.length);
  });

  it('notesSoundingAt re-enters sustained harmony mid-chord, trimmed', () => {
    const resumed = notesSoundingAt(notes, 5);
    expect(resumed.filter((n) => n.part === 'pad').map((n) => [n.beat, n.durationBeats])).toEqual([[5, 3], [5, 3], [5, 3]]);
    expect(resumed.every((n) => n.part === 'pad' || n.part === 'bass')).toBe(true);
  });
});
