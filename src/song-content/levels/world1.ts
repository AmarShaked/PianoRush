import type { LevelDefinition, WorldDefinition } from '../level';
import { sequence, type Step } from '../notation';
import { SONG_SCHEMA_VERSION, type SongDefinition } from '../schema';
import { starlightSteps } from '../songs/starlightSteps';

/*
 * World 1 — First Touch. Ten original pieces, right hand, five-finger
 * position starting on middle C. Each level adds exactly one idea:
 *   1–5  one more key per level (C → C–G), short notes and rests only
 *   6    hold notes          7  jumps (3rds, 5ths)
 *   8    mixed rhythms       9  memory (tiles fade on the repeat)
 *   10   the full performance piece
 * Every piece is phrase-based (question / answer, ends on the tonic C)
 * and sized to 30–60 s.
 */

const C = 60;
const D = 62;
const E = 64;
const F = 65;
const G = 67;
const R = null;

const STANDARD = {
  modes: ['discover', 'flow', 'challenge'] as const,
  completion: { minNoteAccuracy: 0.5 },
  stars: { two: 0.8, three: 0.95 },
};

function song(
  id: string,
  title: string,
  bpm: number,
  lanes: number[],
  steps: Step[],
  backing: SongDefinition['backing'],
  extra: Partial<Pick<SongDefinition, 'holdMinBeats' | 'assist'>> = {},
): SongDefinition {
  return {
    schemaVersion: SONG_SCHEMA_VERSION,
    id,
    title,
    composer: 'Piano Rush Original',
    bpm,
    timeSignature: [4, 4],
    countInBeats: 4,
    lanes,
    notes: sequence(steps),
    // Levels 1–5 teach pitch only: nothing is a hold tile.
    holdMinBeats: extra.holdMinBeats ?? 99,
    backing,
    ...(extra.assist ? { assist: extra.assist } : {}),
  };
}

// 1 — First Note: one key, rhythm and rests only.
const firstNote = song('w1-first-note', 'Knock Knock', 80, [C], [
  [C, 1], [C, 1], [C, 1], [R, 1],   [C, 1], [C, 1], [C, 1], [R, 1],
  [C, 1], [R, 1], [C, 1], [R, 1],   [C, 1], [C, 1], [C, 1], [R, 1],
  [C, 1], [C, 1], [R, 1], [C, 1],   [C, 1], [C, 1], [R, 2],
  [C, 1], [C, 1], [C, 1], [C, 1],   [C, 1], [R, 3],
  [C, 1], [R, 1], [C, 1], [C, 1],   [C, 1], [R, 3],
  [C, 1], [C, 1], [C, 1], [R, 1],   [C, 1], [R, 3],
], { style: 'gentle', chords: [[0, 'C'], [4, 'F'], [8, 'C'], [12, 'Am'], [16, 'F'], [20, 'C'], [24, 'Am'], [28, 'C'], [32, 'F'], [36, 'Am'], [40, 'F'], [44, 'C']] });

// 2 — Up & Down: C and D, question/answer ending on C.
const upAndDown = song('w1-up-down', 'Seesaw', 88, [C, D], [
  [C, 1], [D, 1], [C, 1], [R, 1],   [D, 1], [C, 1], [D, 1], [R, 1],
  [C, 1], [C, 1], [D, 1], [D, 1],   [C, 1], [R, 3],
  [D, 1], [D, 1], [C, 1], [C, 1],   [D, 1], [C, 1], [D, 1], [R, 1],
  [C, 1], [D, 1], [C, 1], [D, 1],   [D, 1], [R, 3],
  [C, 1], [D, 1], [C, 1], [R, 1],   [D, 1], [C, 1], [D, 1], [R, 1],
  [C, 1], [D, 1], [D, 1], [C, 1],   [C, 1], [R, 3],
], { style: 'gentle', chords: [[0, 'C'], [4, 'G'], [8, 'C'], [10, 'G'], [12, 'C'], [16, 'G'], [18, 'C'], [20, 'G'], [24, 'Am'], [28, 'G'], [32, 'C'], [36, 'G'], [40, 'C'], [42, 'G'], [44, 'C']] });

// 3 — Three Steps: C D E, stepwise up and down.
const threeSteps = song('w1-three-steps', 'Stairway Stroll', 90, [C, D, E], [
  [C, 1], [D, 1], [E, 1], [R, 1],   [E, 1], [D, 1], [C, 1], [R, 1],
  [C, 1], [D, 1], [E, 1], [D, 1],   [C, 1], [R, 3],
  [E, 1], [E, 1], [D, 1], [R, 1],   [D, 1], [D, 1], [C, 1], [R, 1],
  [C, 1], [D, 1], [E, 1], [E, 1],   [D, 1], [R, 3],
  [C, 1], [D, 1], [E, 1], [R, 1],   [E, 1], [D, 1], [C, 1], [R, 1],
  [D, 1], [E, 1], [D, 1], [C, 1],   [C, 1], [R, 3],
], { style: 'gentle', chords: [[0, 'C'], [4, 'Am'], [8, 'C'], [16, 'C'], [18, 'G'], [20, 'G'], [22, 'Am'], [24, 'Am'], [28, 'G'], [32, 'C'], [36, 'Am'], [40, 'G7'], [44, 'C']] });

// 4 — Little Melody: C–F, first real tune shape.
const littleMelody = song('w1-little-melody', 'Paper Boats', 92, [C, D, E, F], [
  [C, 1], [D, 1], [E, 1], [F, 1],   [E, 1], [R, 1], [D, 1], [R, 1],
  [C, 1], [D, 1], [E, 1], [C, 1],   [D, 1], [R, 3],
  [F, 1], [E, 1], [D, 1], [R, 1],   [E, 1], [D, 1], [C, 1], [R, 1],
  [D, 1], [E, 1], [F, 1], [E, 1],   [D, 1], [R, 3],
  [C, 1], [D, 1], [E, 1], [F, 1],   [E, 1], [D, 1], [C, 1], [R, 1],
  [D, 1], [F, 1], [E, 1], [D, 1],   [C, 1], [R, 1], [E, 1], [D, 1],
  [C, 1], [R, 3],
], { style: 'straight', chords: [[0, 'C'], [4, 'C'], [6, 'G'], [8, 'Am'], [12, 'G'], [16, 'Dm'], [20, 'C'], [24, 'G7'], [28, 'G'], [32, 'C'], [36, 'Am'], [40, 'G7'], [42, 'C'], [44, 'C'], [47, 'G'], [48, 'C']] });

// 5 — Five Fingers: the full C–G position.
const fiveFingers = song('w1-five-fingers', 'High Five', 92, [C, D, E, F, G], [
  [C, 1], [D, 1], [E, 1], [F, 1],   [G, 1], [R, 1], [G, 1], [R, 1],
  [F, 1], [E, 1], [D, 1], [C, 1],   [D, 1], [R, 3],
  [C, 1], [D, 1], [E, 1], [F, 1],   [G, 1], [R, 1], [E, 1], [R, 1],
  [F, 1], [D, 1], [E, 1], [D, 1],   [C, 1], [R, 3],
  [G, 1], [F, 1], [E, 1], [D, 1],   [E, 1], [F, 1], [G, 1], [R, 1],
  [E, 1], [D, 1], [C, 1], [D, 1],   [C, 1], [R, 1], [E, 1], [D, 1],
  [C, 1], [R, 3],
], { style: 'straight', chords: [[0, 'C'], [4, 'Em'], [8, 'Dm'], [12, 'G'], [16, 'C'], [20, 'C'], [24, 'Dm'], [26, 'C'], [27, 'G'], [28, 'C'], [32, 'Em'], [36, 'C'], [40, 'Am'], [44, 'C'], [47, 'G'], [48, 'C']] });

// 6 — Hold It: half and whole notes (hold tiles, release is scored).
const holdIt = song(
  'w1-hold-it',
  'Lantern Glow',
  88,
  [C, D, E, F, G],
  [
    [C, 2], [E, 2],   [F, 2], [D, 2],   [E, 1], [D, 1], [C, 2],   [D, 4],
    [E, 2], [G, 2],   [F, 2], [D, 2],   [E, 1], [D, 1], [E, 1], [F, 1],   [G, 4],
    [G, 2], [F, 2],   [E, 2], [D, 2],   [E, 1], [F, 1], [D, 2],   [C, 4],
  ],
  { style: 'gentle', chords: [[0, 'C'], [4, 'Dm'], [8, 'C'], [12, 'G'], [16, 'C'], [20, 'Dm'], [24, 'C'], [28, 'G'], [32, 'G7'], [36, 'C'], [38, 'G'], [40, 'Am'], [42, 'G7'], [44, 'C']] },
  { holdMinBeats: 1.5 },
);

// 7 — Jump!: thirds and fifths instead of steps.
const jump = song(
  'w1-jump',
  'Frog Pond',
  92,
  [C, D, E, F, G],
  [
    [C, 1], [E, 1], [C, 1], [E, 1],   [D, 1], [F, 1], [D, 1], [F, 1],
    [E, 1], [G, 1], [E, 1], [C, 1],   [D, 2], [R, 2],
    [C, 1], [G, 1], [C, 1], [G, 1],   [E, 1], [C, 1], [G, 2],
    [F, 1], [D, 1], [G, 1], [E, 1],   [C, 2], [R, 2],
    [G, 1], [E, 1], [G, 1], [E, 1],   [F, 1], [D, 1], [F, 1], [D, 1],
    [E, 1], [C, 1], [G, 1], [D, 1],   [C, 2], [R, 2],
  ],
  { style: 'straight', chords: [[0, 'C'], [4, 'Dm'], [8, 'C'], [12, 'G'], [16, 'C'], [20, 'Em'], [24, 'G7'], [28, 'C'], [32, 'C'], [36, 'Dm'], [40, 'C'], [43, 'G7'], [44, 'C']] },
  { holdMinBeats: 1.5 },
);

// 8 — Rhythm Run: eighths, dotted rhythms, off-beat entries.
const rhythmRun = song(
  'w1-rhythm-run',
  'Skip and Hop',
  92,
  [C, D, E, F, G],
  [
    [C, 0.5], [C, 0.5], [E, 1], [G, 0.5], [G, 0.5], [E, 1],
    [F, 1.5], [E, 0.5], [D, 1], [R, 1],
    [E, 0.5], [F, 0.5], [G, 0.5], [E, 0.5], [D, 1], [C, 1],
    [D, 1], [R, 0.5], [D, 0.5], [E, 2],
    [C, 0.5], [C, 0.5], [E, 1], [G, 0.5], [G, 0.5], [E, 1],
    [F, 1.5], [E, 0.5], [D, 0.5], [E, 0.5], [F, 1],
    [G, 0.5], [F, 0.5], [E, 0.5], [D, 0.5], [E, 1], [D, 1],
    [C, 2], [R, 2],
    [G, 0.5], [G, 0.5], [F, 0.5], [F, 0.5], [E, 0.5], [E, 0.5], [D, 1],
    [E, 1.5], [F, 0.5], [G, 2],
    [G, 0.5], [F, 0.5], [E, 1], [D, 0.5], [E, 0.5], [D, 1],
    [C, 3], [R, 1],
  ],
  { style: 'groove', chords: [[0, 'C'], [4, 'Dm'], [8, 'C'], [10, 'G'], [12, 'G'], [14, 'C'], [16, 'C'], [20, 'Dm'], [24, 'C'], [27, 'G'], [28, 'C'], [32, 'G7'], [34, 'Am'], [36, 'C'], [40, 'G7'], [44, 'C']] },
  { holdMinBeats: 1.5 },
);

// 9 — Memory Challenge: each phrase is shown once, then repeated with fading tiles.
const memoryA: Step[] = [
  [C, 1], [E, 1], [D, 1], [F, 1],   [E, 1], [G, 1], [F, 2],
  [E, 1], [D, 1], [E, 1], [F, 1],   [G, 2], [R, 2],
];
const memoryB: Step[] = [
  [G, 1], [E, 1], [F, 1], [D, 1],   [E, 1], [D, 1], [C, 2],
];
const memory = song(
  'w1-memory',
  'Echo Valley',
  92,
  [C, D, E, F, G],
  [...memoryA, ...memoryA, ...memoryB, ...memoryB],
  { style: 'straight', chords: [[0, 'C'], [2, 'G7'], [4, 'C'], [6, 'Dm'], [8, 'C'], [12, 'G'], [16, 'C'], [18, 'G7'], [20, 'C'], [22, 'Dm'], [24, 'C'], [28, 'G'], [32, 'G7'], [36, 'C'], [40, 'G7'], [44, 'C']] },
  { holdMinBeats: 1.5, assist: { fadeRanges: [[16, 32], [40, 48]] } },
);

function level(
  number: number,
  title: string,
  objective: string,
  songDef: SongDefinition,
): LevelDefinition {
  return { id: songDef.id, world: 1, number, title, objective, hand: 'right', song: songDef, ...STANDARD };
}

export const WORLD_1: WorldDefinition = {
  id: 1,
  title: 'First Touch',
  subtitle: 'Five keys from middle C, right hand',
  levels: [
    level(1, 'First Note', 'Find middle C and play it in time.', firstNote),
    level(2, 'Up & Down', 'Move between C and D.', upAndDown),
    level(3, 'Three Steps', 'Walk up and down C–D–E.', threeSteps),
    level(4, 'Little Melody', 'Add F and play your first tune.', littleMelody),
    level(5, 'Five Fingers', 'Use all five fingers, C to G.', fiveFingers),
    level(6, 'Hold It', 'Keep keys down for long notes.', holdIt),
    level(7, 'Jump!', 'Skip over keys: thirds and fifths.', jump),
    level(8, 'Rhythm Run', 'Quick notes, dotted rhythms and rests.', rhythmRun),
    level(9, 'Memory Challenge', 'Play each repeat from memory.', memory),
    level(10, 'First Concert', 'Put it all together in a full piece.', { ...starlightSteps, id: 'w1-first-concert' }),
  ],
};
