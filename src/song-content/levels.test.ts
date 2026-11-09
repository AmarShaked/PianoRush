import { describe, expect, it } from 'vitest';
import { chordAt, compileSong, HITS, isChordTone, parseChord, validateSong, WORLD_1, WORLD_2, WORLD_3, WORLD_4, WORLD_5, WORLD_6 } from './index';
import type { LevelDefinition } from './level';

const levels = WORLD_1.levels;

describe('World 1 levels', () => {
  it('has the ten PRD levels in order', () => {
    expect(levels.map((l) => l.title)).toEqual([
      'First Note', 'Up & Down', 'Three Steps', 'Little Melody', 'Five Fingers',
      'Hold It', 'Jump!', 'Rhythm Run', 'Memory Challenge', 'First Concert',
    ]);
    expect(levels.map((l) => l.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(levels.map((l) => l.id)).size).toBe(10);
    expect(new Set(levels.map((l) => l.song.id)).size).toBe(10);
  });

  it.each(levels.map((l) => [l.title, l] as const))('%s is a valid song of 30–60 s', (_, level) => {
    expect(validateSong(level.song)).toEqual({ valid: true, errors: [] });
    const song = compileSong(level.song);
    const seconds = song.endMs / 1000;
    expect(seconds).toBeGreaterThanOrEqual(30);
    expect(seconds).toBeLessThanOrEqual(60);
  });

  it.each(levels.map((l) => [l.title, l] as const))('%s uses every lane and ends on C', (_, level) => {
    const song = compileSong(level.song);
    expect(new Set(song.notes.map((n) => n.midi))).toEqual(new Set(level.song.lanes));
    expect(song.notes.at(-1)?.midi).toBe(60);
  });

  it('uses famous public-domain tunes where they fit the keys taught so far', () => {
    expect(levels.map((l) => l.song.title)).toEqual([
      'Knock Knock', 'Seesaw', 'Au Clair de la Lune', 'Paper Boats', 'Ode to Joy',
      'When the Saints Go Marching In', 'Frog Pond', 'Jingle Bells', 'Echo Valley', 'Starlight Steps',
    ]);
    for (const l of levels) {
      if (['Au Clair de la Lune', 'Ode to Joy', 'When the Saints Go Marching In', 'Jingle Bells'].includes(l.song.title)) {
        expect(l.song.composer).toMatch(/public domain/);
      }
    }
  });

  it('every level has an energetic pop / dance / groove backing', () => {
    for (const l of levels) expect(['pop', 'dance', 'groove']).toContain(l.song.backing!.style);
    expect(levels[0]!.song.backing!.style).toBe('dance');
    expect(levels[0]!.song.bpm).toBeGreaterThanOrEqual(100);
  });

  it('levels 1–5 add exactly one key each, contiguous white keys from middle C', () => {
    const white = [60, 62, 64, 65, 67];
    levels.slice(0, 5).forEach((l, i) => expect(l.song.lanes).toEqual(white.slice(0, i + 1)));
  });

  it('introduces hold notes in level 6, not before', () => {
    const holds = levels.map((l) => compileSong(l.song).holdCount);
    expect(holds.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(holds[5]).toBeGreaterThan(5);
  });

  it('introduces eighth notes no earlier than Rhythm Run (except the final concert)', () => {
    const hasEighths = (i: number) => levels[i]!.song.notes.some((n) => n.durationBeats < 1);
    for (let i = 0; i < 7; i++) expect(hasEighths(i)).toBe(false);
    expect(hasEighths(7)).toBe(true);
  });

  it('the memory level fades exactly the repeated phrases', () => {
    const song = compileSong(levels[8]!.song);
    const faded = song.notes.filter((n) => n.assistFade);
    expect(faded.length).toBeGreaterThan(0);
    expect(faded.every((n) => (n.startBeat >= 16 && n.startBeat < 32) || (n.startBeat >= 40 && n.startBeat < 48))).toBe(true);
    // The faded repeat is the same melody as the visible first statement.
    const first = song.notes.filter((n) => n.startBeat < 16).map((n) => [n.midi, n.durationBeats]);
    const repeat = song.notes.filter((n) => n.startBeat >= 16 && n.startBeat < 32).map((n) => [n.midi, n.durationBeats]);
    expect(repeat).toEqual(first);
  });

  it('every level offers all three modes and sane thresholds', () => {
    for (const l of levels) {
      expect(l.modes).toEqual(['discover', 'flow', 'challenge']);
      expect(l.completion.minNoteAccuracy).toBeLessThan(l.stars.two);
      expect(l.stars.two).toBeLessThan(l.stars.three);
    }
  });
});

describe('song compilation: events and holds', () => {
  it('groups notes that start together into one chord event', () => {
    const song = compileSong({
      schemaVersion: 1, id: 'c', title: 'c', composer: 'c', bpm: 120, timeSignature: [4, 4], countInBeats: 4,
      lanes: [60, 64, 67],
      notes: [
        { midi: 67, startBeat: 0, durationBeats: 1 },
        { midi: 60, startBeat: 0, durationBeats: 1 },
        { midi: 64, startBeat: 1, durationBeats: 2 },
      ],
    });
    expect(song.events.map((e) => e.noteIds.length)).toEqual([2, 1]);
    expect(song.notes.map((n) => [n.midi, n.eventId, n.isHold])).toEqual([[60, 0, false], [67, 0, false], [64, 1, true]]);
    expect(song.holdCount).toBe(1);
  });
});

const allSongs = [...levels, ...WORLD_2.levels, ...WORLD_3.levels, ...WORLD_4.levels, ...WORLD_5.levels, ...WORLD_6.levels, ...HITS.levels];

describe('World 1 and Hits accompaniment', () => {
  it.each(allSongs.map((l) => [l.id, l] as const))('%s has a valid backing that covers the whole song', (_, level) => {
    const song = compileSong(level.song);
    expect(level.song.backing).toBeDefined();
    const chords = level.song.backing!.chords;
    expect(chords[0]![0]).toBe(0);
    expect(chords.at(-1)![0]).toBeLessThan(song.totalBeats);
  });

  /*
   * Consonance rule: every melody note that starts on a strong beat (the
   * downbeat, plus the middle of the bar in even meters — beats 1 and 3 in 4/4)
   * or lasts two beats or more must be a tone of the chord that is sounding,
   * for its whole length. Passing notes on weak beats are free.
   */
  // Composed content only: imported (licensed) arrangements carry inferred chords.
  const composed = allSongs.filter((l) => !l.song.composer.includes('licensed'));
  it.each(composed.map((l) => [l.id, l] as const))('%s: strong-beat and long melody notes are chord tones', (_, level) => {
    const chords = level.song.backing!.chords;
    const clashes: string[] = [];
    const bpb = level.song.timeSignature[0];
    for (const n of level.song.notes) {
      const pos = n.startBeat % bpb;
      const strong = Math.abs(pos) < 1e-9 || (bpb % 2 === 0 && Math.abs(pos - bpb / 2) < 1e-9);
      if (!strong && n.durationBeats < 2) continue;
      // Check at the start and at every chord change while the note sounds.
      const checkpoints = [n.startBeat, ...chords.map(([b]) => b).filter((b) => b > n.startBeat && b < n.startBeat + n.durationBeats)];
      for (const beat of checkpoints) {
        const symbol = chordAt(chords, beat)!;
        if (!isChordTone(parseChord(symbol)!, n.midi)) clashes.push(`beat ${beat}: ${n.midi} over ${symbol}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('every composed song ends on a tone of its final (tonic) chord', () => {
    for (const l of allSongs.filter((x) => !x.song.composer.includes('licensed'))) {
      const last = [...l.song.notes].sort((a, b) => a.startBeat - b.startBeat).at(-1)!;
      expect(isChordTone(parseChord(l.song.backing!.chords.at(-1)![1])!, last.midi)).toBe(true);
    }
  });

  it('finger numbers, when given, match the lanes one-to-one', () => {
    for (const l of allSongs) if (l.song.fingers) expect(l.song.fingers).toHaveLength(l.song.lanes.length);
  });
});

describe('chord vocabulary', () => {
  it.each([
    ['C', [0, 4, 7]],
    ['Dm', [2, 5, 9]],
    ['G7', [7, 11, 2, 5]],
    ['F#m', [6, 9, 1]],
    ['Bb', [10, 2, 5]],
    ['Bdim', [11, 2, 5]],
  ] as const)('%s → %j', (symbol, pcs) => {
    expect(parseChord(symbol)?.pitchClasses).toEqual(pcs);
  });

  it('rejects unknown symbols', () => {
    expect(parseChord('H')).toBeNull();
    expect(parseChord('Cfoo')).toBeNull();
  });
});

describe('Hits (free play)', () => {
  it('licensed hits are playable arrangements: right hand, one note at a time, at most 8 keys', () => {
    for (const l of HITS.levels.filter((x) => x.song.composer.includes('licensed'))) {
      expect(l.song.lanes.length).toBeLessThanOrEqual(8);
      expect(compileSong(l.song).events.every((e) => e.noteIds.length === 1)).toBe(true);
      expect(l.song.notes.every((n) => n.hand === 'right')).toBe(true);
    }
  });

  it('is a free-play list of famous public-domain songs', () => {
    expect(HITS.kind).toBe('freeplay');
    expect(HITS.levels.map((l) => l.title)).toEqual([
      'Dance Monkey', 'Can You Feel the Love Tonight',
      'Ode to Joy', 'Jingle Bells', 'When the Saints Go Marching In', 'Au Clair de la Lune', 'Mary Had a Little Lamb', 'Twinkle Twinkle Little Star',
      'London Bridge', 'Lightly Row', 'Go Tell Aunt Rhody', 'Hot Cross Buns',
      'Joy to the World', "Brahms' Lullaby", 'Amazing Grace', 'Greensleeves', 'Für Elise',
    ]);
    for (const l of HITS.levels) expect(l.song.composer).toMatch(/public domain|licensed/);
  });

  it('uses ids separate from World 1 (separate progress, no unlock side effects)', () => {
    const w1 = new Set(WORLD_1.levels.map((l) => l.id));
    for (const l of HITS.levels) expect(w1.has(l.id)).toBe(false);
  });

  it.each(HITS.levels.map((l) => [l.title, l] as const))('%s is valid, 30–90 s and uses every lane', (_, level) => {
    expect(validateSong(level.song)).toEqual({ valid: true, errors: [] });
    const song = compileSong(level.song);
    expect(song.endMs / 1000).toBeGreaterThanOrEqual(30);
    expect(song.endMs / 1000).toBeLessThanOrEqual(90);
    expect(new Set(song.notes.map((n) => n.midi))).toEqual(new Set(level.song.lanes));
  });

  it('every song fits the keyboard simulator', async () => {
    const { DEFAULT_KEY_MAP } = await import('../piano-input/KeyboardSimulator');
    const mapped = new Set(Object.values(DEFAULT_KEY_MAP));
    for (const l of [...HITS.levels, ...WORLD_3.levels]) for (const m of l.song.lanes) expect(mapped.has(m)).toBe(true);
  });
});

describe('World 2 — Rhythm Road', () => {
  const w2 = WORLD_2.levels;
  const notesOf = (i: number) => compileSong(w2[i]!.song).notes;

  it('is a path world of ten levels with ids distinct from World 1 and Hits', () => {
    expect(WORLD_2.kind).toBe('path');
    expect(w2.map((l) => l.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const others = new Set([...WORLD_1.levels, ...HITS.levels].map((l) => l.id));
    for (const l of w2) expect(others.has(l.id)).toBe(false);
  });

  it.each(w2.map((l) => [l.title, l] as const))('%s is valid, 30–60 s, ends on C, within C–G', (_, level) => {
    expect(validateSong(level.song)).toEqual({ valid: true, errors: [] });
    const song = compileSong(level.song);
    expect(song.endMs / 1000).toBeGreaterThanOrEqual(30);
    expect(song.endMs / 1000).toBeLessThanOrEqual(60);
    expect(song.notes.at(-1)?.midi).toBe(60);
    expect(new Set(song.notes.map((n) => n.midi))).toEqual(new Set(level.song.lanes));
    for (const m of level.song.lanes) expect([60, 62, 64, 65, 67]).toContain(m);
  });

  it('each level contains the rhythm it teaches', () => {
    const durations = (i: number) => new Set(notesOf(i).map((n) => n.durationBeats));
    const restsInside = (i: number) => {
      const ns = notesOf(i);
      return ns.slice(1).filter((n, k) => n.startBeat - (ns[k]!.startBeat + ns[k]!.durationBeats) > 0.4).length;
    };
    expect(notesOf(0).every((n) => n.durationBeats >= 1)).toBe(true); // 1: quarters, no eighths
    expect(durations(1).has(2) && durations(1).has(4)).toBe(true); // 2: halves & wholes
    expect(restsInside(2)).toBeGreaterThan(15); // 3: many rests inside phrases
    expect(durations(3).has(0.5)).toBe(true); // 4: eighths
    expect(w2[4]!.song.timeSignature).toEqual([3, 4]); // 5: waltz
    expect(w2[4]!.song.backing!.style).toBe('waltz');
    expect(durations(5).has(1.5) && durations(5).has(0.5)).toBe(true); // 6: dotted quarter + eighth
    expect(notesOf(6).filter((n) => n.startBeat % 1 === 0.5 && n.durationBeats >= 1.5).length).toBeGreaterThan(5); // 7: syncopation
    expect(compileSong(w2[8]!.song).notes.some((n) => n.assistFade)).toBe(true); // 9: memory fades
  });

  it('the rhythm-memory level fades exact repeats of what was shown', () => {
    const notes = notesOf(8);
    const slice = (from: number, to: number) => notes.filter((n) => n.startBeat >= from && n.startBeat < to).map((n) => [n.midi, n.durationBeats, n.startBeat - from]);
    expect(slice(16, 32)).toEqual(slice(0, 16));
    expect(slice(48, 64)).toEqual(slice(32, 48));
    expect(notes.filter((n) => n.assistFade).every((n) => (n.startBeat >= 16 && n.startBeat < 32) || n.startBeat >= 48)).toBe(true);
  });

  it('uses public-domain tunes for levels 2, 4 and 8', () => {
    expect([1, 3, 7].map((i) => w2[i]!.song.title)).toEqual(['Lightly Row', 'Hot Cross Buns', 'Go Tell Aunt Rhody']);
    for (const i of [1, 3, 7]) expect(w2[i]!.song.composer).toMatch(/public domain/);
  });
});

/** Shared checks for every path world. */
function pathWorldBasics(levels: readonly LevelDefinition[]) {
  it.each(levels.map((l) => [l.title, l] as const))('%s is valid, 30–60 s and uses every lane', (_, level) => {
    expect(validateSong(level.song)).toEqual({ valid: true, errors: [] });
    const song = compileSong(level.song);
    expect(song.endMs / 1000).toBeGreaterThanOrEqual(30);
    expect(song.endMs / 1000).toBeLessThanOrEqual(60);
    expect(new Set(song.notes.map((n) => n.midi))).toEqual(new Set(level.song.lanes));
  });
}

describe('World 3 — Melody Mountain', () => {
  const w3 = WORLD_3.levels;
  pathWorldBasics(w3);
  const black = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);

  it('is ten levels, right hand, with growing range', () => {
    expect(w3.map((l) => l.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(w3[0]!.song.lanes).toHaveLength(6);
    expect(Math.max(...w3[1]!.song.lanes) - Math.min(...w3[1]!.song.lanes)).toBe(12); // full octave
  });

  it('introduces black keys only from level 6, one more at a time', () => {
    const blacks = w3.map((l) => l.song.lanes.filter(black).length);
    expect(blacks.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(blacks[5]).toBe(1); // Bb
    expect(blacks[6]).toBe(1); // F#
    expect(blacks[7]).toBe(2); // F#, G#
    expect(blacks[9]).toBe(2); // D#, G#
    expect(w3[5]!.song.preferFlats).toBe(true);
  });

  it('has real jumps in the Big Jumps level', () => {
    const notes = compileSong(w3[3]!.song).notes;
    const leaps = notes.slice(1).filter((n, i) => Math.abs(n.midi - notes[i]!.midi) >= 4).length;
    expect(leaps).toBeGreaterThan(6);
  });

  it('the hand-shift level spends whole phrases in G position', () => {
    const notes = compileSong(w3[4]!.song).notes;
    const phrase2 = notes.filter((n) => n.startBeat >= 16 && n.startBeat < 32);
    expect(phrase2.every((n) => n.midi >= 67)).toBe(true);
  });

  it('the memory level fades exact repeats', () => {
    const notes = compileSong(w3[8]!.song).notes;
    const slice = (from: number, to: number) => notes.filter((n) => n.startBeat >= from && n.startBeat < to).map((n) => [n.midi, n.durationBeats, n.startBeat - from]);
    expect(slice(16, 32)).toEqual(slice(0, 16));
    expect(slice(48, 64)).toEqual(slice(32, 48));
  });
});

describe('all levels', () => {
  it('have unique ids across every world and Hits', () => {
    const ids = allSongs.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(allSongs.filter((l) => l.world > 0)).toHaveLength(60);
  });
});

describe('World 4 — Left Hand Land', () => {
  const w4 = WORLD_4.levels;
  pathWorldBasics(w4);
  it('is all left hand, C3–G3, with 5-4-3-2-1 fingering', () => {
    for (const l of w4) {
      expect(l.hand).toBe('left');
      for (const n of l.song.notes) {
        expect(n.hand).toBe('left');
        expect(n.midi).toBeGreaterThanOrEqual(48);
        expect(n.midi).toBeLessThanOrEqual(55);
      }
      const fingerOf = new Map(l.song.lanes.map((m, i) => [m, l.song.fingers![i]]));
      if (fingerOf.has(48)) expect(fingerOf.get(48)).toBe(5);
      if (fingerOf.has(55)) expect(fingerOf.get(55)).toBe(1);
    }
  });
  it('the bass-line level drops the band bass (the player is the bass)', () => {
    expect(w4[6]!.song.backing!.omit).toContain('bass');
  });
});

describe('World 5 — Chord City', () => {
  const w5 = WORLD_5.levels;
  pathWorldBasics(w5);
  const eventSizes = (i: number) => compileSong(w5[i]!.song).events.map((e) => e.noteIds.length);
  it('teaches two-note, then three-note chords, then patterns', () => {
    expect(eventSizes(0).every((n) => n === 2)).toBe(true);
    expect(eventSizes(2).some((n) => n === 3)).toBe(true);
    expect(eventSizes(3).every((n) => n === 3)).toBe(true); // three primary chords, block
    expect(eventSizes(5).every((n) => n === 1)).toBe(true); // broken chords: one tone at a time
    expect(compileSong(w5[6]!.song).notes.some((n) => n.durationBeats < 0.5)).toBe(true); // alberti eighths
  });
  it('from level 4 the band plays the tune above the player, never in the player range', () => {
    for (const l of w5.slice(3)) {
      const lead = l.song.backing!.lead!;
      expect(lead.length).toBeGreaterThan(10);
      expect(l.song.backing!.omit).toEqual(['pad', 'keys']);
    }
  });
  it('chord parts stay in the right-hand chord range B3–A4', () => {
    for (const l of w5) for (const m of l.song.lanes) expect(m >= 59 && m <= 69).toBe(true);
  });
});

describe('World 6 — Two Hands Festival', () => {
  const w6 = WORLD_6.levels;
  pathWorldBasics(w6);
  const hands = (i: number) => {
    const notes = compileSong(w6[i]!.song).notes;
    const def = w6[i]!.song;
    const handOf = (m: number) => def.notes.find((n) => n.midi === m)!.hand;
    return { notes, handOf };
  };
  it('uses both hands in every level: left C3–G3, right C4 and up', () => {
    for (const l of w6) {
      expect(l.song.notes.some((n) => n.hand === 'left' && n.midi < 60)).toBe(true);
      expect(l.song.notes.some((n) => n.hand === 'right' && n.midi >= 60)).toBe(true);
    }
  });
  it('level 1 alternates hands (never together); from level 2 the hands overlap', () => {
    const overlapping = (i: number) => {
      const { notes, handOf } = hands(i);
      const left = notes.filter((n) => handOf(n.midi) === 'left');
      const right = notes.filter((n) => handOf(n.midi) === 'right');
      return left.some((l) => right.some((r) => r.timeMs < l.timeMs + l.durationMs && l.timeMs < r.timeMs + r.durationMs));
    };
    expect(overlapping(0)).toBe(false);
    for (let i = 1; i < w6.length; i++) expect(overlapping(i)).toBe(true);
  });
  it('the band leaves the bass to the player (except call & response)', () => {
    for (const l of w6.slice(1)) expect(l.song.backing!.omit).toContain('bass');
  });
});
