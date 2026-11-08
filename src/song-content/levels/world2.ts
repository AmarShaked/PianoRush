import type { LevelDefinition, WorldDefinition } from '../level';
import { sequence, type Step } from '../notation';
import { fiveFingerFingering } from '../parts';
import { SONG_SCHEMA_VERSION, type BackingSpec, type SongDefinition } from '../schema';
import { AUNT_RHODY, HOT_CROSS_BUNS, LIGHTLY_ROW, type PublicDomainTune } from '../songs/publicDomain';

/*
 * World 2 — Rhythm Road. Same five-finger position (C–G) as World 1, so the
 * only new thing each level brings is rhythm (PRD §7.1: rhythm, sustained
 * notes, rests):
 *   1 steady pulse · 2 halves & wholes · 3 rests inside phrases · 4 eighths
 *   5 3/4 time · 6 dotted rhythms · 7 syncopation · 8 mixed review
 *   9 rhythm memory · 10 finale.
 * Levels 2, 4 and 8 are public-domain folk tunes; the rest are originals.
 */

const C = 60;
const D = 62;
const E = 64;
const F = 65;
const G = 67;
const R = null;
const FIVE = [C, D, E, F, G];

function song(
  id: string,
  title: string,
  bpm: number,
  steps: Step[],
  backing: BackingSpec,
  extra: Partial<Pick<SongDefinition, 'assist' | 'timeSignature' | 'countInBeats' | 'lanes' | 'composer'>> = {},
): SongDefinition {
  return {
    schemaVersion: SONG_SCHEMA_VERSION,
    id,
    title,
    composer: extra.composer ?? 'Piano Rush Original',
    bpm,
    timeSignature: extra.timeSignature ?? [4, 4],
    countInBeats: extra.countInBeats ?? 4,
    lanes: extra.lanes ?? FIVE,
    fingers: fiveFingerFingering(extra.lanes ?? FIVE, 'right', 60),
    notes: sequence(steps),
    holdMinBeats: 1.5,
    backing,
    ...(extra.assist ? { assist: extra.assist } : {}),
  };
}

function fromTune(id: string, tune: PublicDomainTune, bpm: number, style: BackingSpec['style']): SongDefinition {
  return song(id, tune.title, bpm, [...tune.steps], { style, chords: tune.chords }, { lanes: tune.lanes, composer: tune.credit });
}

// 1 — Steady Beat: a march of quarter notes; phrase ends on a half note.
const steadyBeat = song('w2-steady-beat', 'Marching Band', 104, [
  [C, 1], [D, 1], [E, 1], [C, 1],   [E, 1], [F, 1], [G, 1], [E, 1],   [F, 1], [E, 1], [D, 1], [C, 1],   [D, 1], [G, 1], [G, 2],
  [C, 1], [D, 1], [E, 1], [C, 1],   [E, 1], [F, 1], [G, 1], [E, 1],   [F, 1], [D, 1], [E, 1], [D, 1],   [C, 4],
  [G, 1], [F, 1], [E, 1], [D, 1],   [E, 1], [F, 1], [G, 2],           [F, 1], [E, 1], [D, 1], [C, 1],   [D, 1], [E, 1], [D, 2],
  [C, 1], [D, 1], [E, 1], [C, 1],   [E, 1], [F, 1], [G, 1], [E, 1],   [F, 1], [D, 1], [E, 1], [D, 1],   [C, 4],
], { style: 'dance', chords: [[0, 'C'], [8, 'G7'], [12, 'G'], [16, 'C'], [24, 'Dm'], [26, 'C'], [28, 'C'], [32, 'Em'], [36, 'C'], [40, 'Dm'], [44, 'G'], [48, 'C'], [56, 'Dm'], [58, 'C'], [60, 'C']] });

// 2 — Long & Short: "Lightly Row" — half and whole notes to hold.
const longShort = fromTune('w2-long-short', LIGHTLY_ROW, 100, 'pop');

// 3 — Rest Stop: silences are part of the music — count them.
const restStop = song('w2-rest-stop', 'Tiptoe', 96, [
  [C, 1], [R, 1], [E, 1], [R, 1],   [G, 1], [R, 1], [E, 1], [R, 1],   [F, 1], [E, 1], [D, 1], [R, 1],   [C, 1], [R, 3],
  [E, 1], [R, 1], [G, 1], [R, 1],   [F, 1], [R, 1], [D, 1], [R, 1],   [E, 1], [D, 1], [C, 1], [R, 1],   [D, 1], [R, 3],
  [C, 1], [R, 1], [C, 1], [E, 1],   [R, 1], [G, 1], [R, 1], [E, 1],   [F, 1], [R, 1], [D, 1], [R, 1],   [G, 2], [R, 2],
  [E, 1], [R, 1], [G, 1], [R, 1],   [F, 1], [R, 1], [D, 1], [R, 1],   [E, 1], [D, 1], [R, 1], [D, 1],   [C, 2], [R, 2],
], { style: 'groove', chords: [[0, 'C'], [4, 'Em'], [8, 'Dm'], [12, 'C'], [16, 'C'], [20, 'Dm'], [24, 'C'], [28, 'G'], [32, 'F'], [36, 'C'], [40, 'Dm'], [44, 'G'], [48, 'C'], [52, 'Dm'], [56, 'C'], [59, 'G7'], [60, 'C']] });

// 4 — Quick Pairs: "Hot Cross Buns" — eighth notes, two per beat.
const quickPairs = fromTune('w2-quick-pairs', HOT_CROSS_BUNS, 104, 'dance');

// 5 — Waltz Time: three beats in a bar (3/4), "oom-pah-pah".
const waltzA: Step[] = [
  [C, 2], [E, 1],   [G, 2], [E, 1],   [F, 2], [E, 1],   [D, 3],
  [G, 2], [F, 1],   [E, 2], [D, 1],   [D, 2], [E, 1],   [C, 3],
];
const waltzB: Step[] = [
  [E, 2], [F, 1],   [G, 2], [G, 1],   [F, 2], [F, 1],   [E, 3],
  [D, 2], [E, 1],   [F, 2], [D, 1],   [E, 2], [D, 1],   [D, 3],
];
const waltzChordsA: [number, string][] = [[0, 'C'], [3, 'C'], [6, 'F'], [9, 'G'], [12, 'G7'], [15, 'C'], [18, 'G'], [21, 'C']];
const waltz = song(
  'w2-waltz',
  'Carousel',
  132,
  [...waltzA, ...waltzB, ...waltzA],
  {
    style: 'waltz',
    chords: [
      ...waltzChordsA,
      [24, 'C'], [27, 'C'], [30, 'F'], [33, 'C'], [36, 'G'], [39, 'G7'], [42, 'C'], [45, 'G'],
      ...waltzChordsA.map(([b, c]) => [b + 48, c] as [number, string]),
    ],
  },
  { timeSignature: [3, 4], countInBeats: 6 },
);

// 6 — Dotted Notes: long-short "gallop" (dotted quarter + eighth).
const dotted = song('w2-dotted', 'Gallop', 100, [
  [C, 1.5], [D, 0.5], [E, 1], [C, 1],   [E, 1.5], [F, 0.5], [G, 2],   [G, 1.5], [F, 0.5], [E, 1], [D, 1],   [E, 1.5], [D, 0.5], [D, 2],
  [C, 1.5], [D, 0.5], [E, 1], [C, 1],   [E, 1.5], [F, 0.5], [G, 2],   [G, 1.5], [F, 0.5], [E, 1], [D, 1],   [D, 1.5], [E, 0.5], [C, 2],
  [F, 1.5], [E, 0.5], [D, 1], [F, 1],   [E, 1.5], [D, 0.5], [C, 2],   [D, 1.5], [E, 0.5], [F, 1], [D, 1],   [E, 1.5], [F, 0.5], [G, 2],
  [G, 1.5], [F, 0.5], [E, 1], [C, 1],   [F, 1.5], [E, 0.5], [D, 2],   [E, 1.5], [D, 0.5], [C, 1], [D, 1],   [C, 4],
], { style: 'pop', chords: [[0, 'C'], [12, 'C'], [14, 'G'], [16, 'C'], [24, 'Em'], [28, 'G'], [30, 'C'], [32, 'Dm'], [36, 'Am'], [40, 'G7'], [44, 'C'], [52, 'Dm'], [56, 'C'], [59, 'G7'], [60, 'C']] });

// 7 — Off the Beat: notes that start on the "and" and push across the beat.
const offBeat = song('w2-off-beat', 'Hopscotch', 100, [
  [C, 1], [E, 1.5], [G, 1.5],   [F, 1], [E, 1.5], [D, 1.5],   [E, 0.5], [F, 0.5], [G, 1], [E, 1], [C, 1],   [D, 1], [R, 0.5], [D, 0.5], [G, 2],
  [C, 1], [E, 1.5], [G, 1.5],   [F, 1], [D, 1.5], [F, 1.5],   [E, 0.5], [D, 0.5], [E, 1], [G, 1], [E, 1],   [C, 2], [R, 2],
  [G, 1], [F, 1.5], [E, 1.5],   [F, 1], [E, 1.5], [D, 1.5],   [E, 0.5], [F, 0.5], [G, 1], [F, 1], [D, 1],   [G, 1], [R, 0.5], [G, 0.5], [G, 2],
  [C, 1], [E, 1.5], [G, 1.5],   [F, 1], [E, 1.5], [D, 1.5],   [E, 0.5], [D, 0.5], [C, 1], [D, 1], [E, 0.5], [D, 0.5],   [C, 4],
], { style: 'dance', chords: [[0, 'C'], [4, 'Dm'], [8, 'C'], [12, 'G'], [16, 'C'], [20, 'Dm'], [24, 'C'], [28, 'C'], [32, 'C'], [36, 'Dm'], [40, 'C'], [42, 'Dm'], [44, 'G'], [48, 'C'], [52, 'Dm'], [56, 'C'], [58, 'G'], [60, 'C']] });

// 8 — Tell It Again: "Go Tell Aunt Rhody" — mixed long and short notes, a bit faster.
const tellItAgain = fromTune('w2-tell-it-again', AUNT_RHODY, 116, 'pop');

// 9 — Rhythm Memory: each rhythm is shown, then repeated with fading tiles.
const memA: Step[] = [
  [C, 1.5], [D, 0.5], [E, 1], [C, 1],   [G, 1], [R, 0.5], [G, 0.5], [E, 2],   [F, 1], [E, 0.5], [D, 0.5], [E, 1], [D, 1],   [C, 2], [R, 2],
];
const memB: Step[] = [
  [E, 1], [E, 0.5], [F, 0.5], [G, 1], [E, 1],   [F, 1], [D, 1], [G, 2],   [E, 0.5], [F, 0.5], [G, 1], [F, 1], [D, 1],   [C, 2], [R, 2],
];
const memChordsA: [number, string][] = [[0, 'C'], [8, 'Dm'], [10, 'C'], [12, 'C']];
const memChordsB: [number, string][] = [[0, 'C'], [4, 'G7'], [8, 'C'], [10, 'Dm'], [12, 'C']];
const rhythmMemory = song(
  'w2-rhythm-memory',
  'Drum Talk',
  100,
  [...memA, ...memA, ...memB, ...memB],
  {
    style: 'dance',
    chords: [
      ...memChordsA,
      ...memChordsA.map(([b, c]) => [b + 16, c] as [number, string]),
      ...memChordsB.map(([b, c]) => [b + 32, c] as [number, string]),
      ...memChordsB.map(([b, c]) => [b + 48, c] as [number, string]),
    ],
  },
  { assist: { fadeRanges: [[16, 32], [48, 64]] } },
);

// 10 — Rhythm Road Finale: steady, dotted, syncopated and running eighths, then home.
const finaleA: Step[] = [[C, 1], [E, 1], [G, 1], [E, 1],   [F, 1], [D, 1], [G, 2],   [E, 1], [C, 1], [D, 1], [F, 1],   [E, 2], [G, 2]];
const finale = song('w2-finale', 'Open Road', 108, [
  ...finaleA,
  [C, 1.5], [D, 0.5], [E, 1], [G, 1],   [F, 1.5], [E, 0.5], [D, 2],   [E, 1.5], [F, 0.5], [G, 1], [E, 1],   [D, 4],
  [C, 1], [E, 1.5], [G, 1.5],   [F, 1], [E, 1.5], [D, 1.5],   [E, 0.5], [F, 0.5], [G, 1], [E, 1], [C, 1],   [D, 1], [R, 0.5], [D, 0.5], [G, 2],
  [E, 0.5], [F, 0.5], [G, 0.5], [F, 0.5], [E, 0.5], [D, 0.5], [C, 1],   [D, 0.5], [E, 0.5], [F, 0.5], [E, 0.5], [D, 2],
  [E, 0.5], [F, 0.5], [G, 0.5], [E, 0.5], [F, 1], [D, 1],   [C, 2], [R, 2],
  ...finaleA,
  [G, 1.5], [F, 0.5], [E, 1], [D, 1],   [E, 1.5], [D, 0.5], [C, 2],   [D, 1], [E, 1], [F, 1], [D, 1],   [C, 4],
], {
  style: 'groove',
  chords: [
    [0, 'C'], [4, 'G7'], [8, 'C'], [10, 'G'], [12, 'C'],
    [16, 'C'], [20, 'Dm'], [24, 'C'], [28, 'G'],
    [32, 'C'], [36, 'Dm'], [40, 'C'], [44, 'G'],
    [48, 'C'], [52, 'G'], [56, 'C'], [58, 'Dm'], [60, 'C'],
    [64, 'C'], [68, 'G7'], [72, 'C'], [74, 'G'], [76, 'C'],
    [80, 'C'], [84, 'Am'], [88, 'G7'], [92, 'C'],
  ],
});

const RULES = {
  hand: 'right' as const,
  modes: ['discover', 'flow', 'challenge'] as const,
  completion: { minNoteAccuracy: 0.5 },
  stars: { two: 0.8, three: 0.95 },
};

function level(number: number, title: string, objective: string, songDef: SongDefinition): LevelDefinition {
  return { id: songDef.id, world: 2, number, title, objective, song: songDef, ...RULES };
}

export const WORLD_2: WorldDefinition = {
  id: 2,
  kind: 'path',
  title: 'Rhythm Road',
  subtitle: 'Same five keys — now master the rhythm',
  levels: [
    level(1, 'Steady Beat', 'Keep a steady quarter-note pulse.', steadyBeat),
    level(2, 'Long & Short', 'Hold half and whole notes for their full length.', longShort),
    level(3, 'Rest Stop', 'Count the silences — rests are music too.', restStop),
    level(4, 'Quick Pairs', 'Eighth notes: two notes in one beat.', quickPairs),
    level(5, 'Waltz Time', 'Feel three beats in a bar: ONE two three.', waltz),
    level(6, 'Dotted Notes', 'Long–short "gallop" rhythms.', dotted),
    level(7, 'Off the Beat', 'Syncopation: notes that land between the beats.', offBeat),
    level(8, 'Tell It Again', 'Mix long and short notes at a quicker tempo.', tellItAgain),
    level(9, 'Rhythm Memory', 'Play each rhythm again from memory.', rhythmMemory),
    level(10, 'Rhythm Road Finale', 'Every rhythm on the road, in one piece.', finale),
  ],
};
