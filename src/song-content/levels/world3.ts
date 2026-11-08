import type { LevelDefinition, WorldDefinition } from '../level';
import { sequence, type Step } from '../notation';
import { transposeChords, transposeSteps } from '../parts';
import { SONG_SCHEMA_VERSION, type BackingSpec, type SongDefinition } from '../schema';
import {
  AMAZING_GRACE,
  BRAHMS_LULLABY,
  FUR_ELISE,
  GREENSLEEVES,
  JOY_TO_THE_WORLD,
  ODE_TO_JOY,
  TWINKLE,
  type PublicDomainTune,
} from '../songs/publicDomain';

/*
 * World 3 — Melody Mountain (PRD §7.1: larger range, jumps, black keys).
 * The right hand leaves the five-finger box: a sixth key, the full octave,
 * wide waltzes and leaps, a hand-position shift, then black keys one at a time
 * (Bb, F#, then G#/F# and D#/G#), ending with Für Elise.
 */

const C = 60;
const D = 62;
const E = 64;
const F = 65;
const G = 67;
const A = 69;
const B = 71;
const C5 = 72;
const D5 = 74;
const Fs = 66;

/** Lanes = exactly the pitches the melody uses, low to high. */
function lanesOf(steps: readonly Step[]): number[] {
  return [...new Set(steps.map(([m]) => m).filter((m): m is number => m !== null))].sort((a, b) => a - b);
}

function song(
  id: string,
  title: string,
  bpm: number,
  steps: readonly Step[],
  backing: BackingSpec,
  extra: Partial<Pick<SongDefinition, 'assist' | 'timeSignature' | 'countInBeats' | 'composer' | 'fingers' | 'preferFlats'>> = {},
): SongDefinition {
  const meter = extra.timeSignature ?? [4, 4];
  return {
    schemaVersion: SONG_SCHEMA_VERSION,
    id,
    title,
    composer: extra.composer ?? 'Piano Rush Original',
    bpm,
    timeSignature: meter,
    countInBeats: extra.countInBeats ?? (meter[0] === 3 ? 6 : 4),
    lanes: lanesOf(steps),
    notes: sequence(steps),
    holdMinBeats: 1.5,
    backing,
    ...(extra.assist ? { assist: extra.assist } : {}),
    ...(extra.fingers ? { fingers: extra.fingers } : {}),
    ...(extra.preferFlats ? { preferFlats: true } : {}),
  };
}

function fromTune(
  id: string,
  tune: PublicDomainTune,
  bpm: number,
  style: BackingSpec['style'],
  extra: Parameters<typeof song>[5] = {},
): SongDefinition {
  return song(id, tune.title, bpm, tune.steps, { style, chords: tune.chords }, { composer: tune.credit, ...extra });
}

// 5 — Hand Shift (original): C position, then up to G position, and back.
const mountainPath: Step[] = [
  [C, 1], [D, 1], [E, 1], [F, 1],   [G, 2], [E, 2],   [F, 1], [E, 1], [D, 1], [C, 1],   [D, 2], [G, 2],
  [G, 1], [A, 1], [B, 1], [C5, 1],   [D5, 2], [B, 2],   [C5, 1], [B, 1], [A, 1], [G, 1],   [B, 2], [D5, 2],
  [C, 1], [E, 1], [G, 1], [E, 1],   [F, 1], [D, 1], [G, 2],   [E, 1], [G, 1], [C5, 1], [G, 1],   [A, 2], [G, 2],
  [D5, 1], [C5, 1], [B, 1], [A, 1],   [G, 1], [A, 1], [B, 1], [G, 1],   [F, 1], [E, 1], [D, 1], [G, 1],   [C, 4],
];

// 7 — F-Sharp (original): G position (G A B C D) plus F#, the first sharp.
const sunriseA: Step[] = [[G, 1], [A, 1], [B, 1], [G, 1],   [A, 1], [B, 1], [C5, 1], [A, 1],   [B, 1], [A, 1], [G, 1], [Fs, 1],   [G, 2], [D5, 2]];
const sunrise: Step[] = [
  ...sunriseA,
  [D5, 1], [C5, 1], [B, 1], [A, 1],   [B, 1], [C5, 1], [D5, 1], [B, 1],   [A, 1], [G, 1], [Fs, 1], [A, 1],   [G, 4],
  [B, 1], [B, 1], [C5, 1], [D5, 1],   [D5, 2], [C5, 1], [B, 1],   [A, 1], [G, 1], [A, 1], [B, 1],   [G, 2], [Fs, 2],
  [G, 1], [A, 1], [B, 1], [G, 1],   [A, 1], [B, 1], [C5, 1], [A, 1],   [B, 1], [A, 1], [G, 1], [Fs, 1],   [G, 4],
];
const G_POSITION_FINGERS = [1, 1, 2, 3, 4, 5]; // F# (thumb reaches down), G A B C D

// 9 — Echo Mountain (original): G position with F#; each phrase is shown, then repeated from memory.
const echoA: Step[] = [[G, 1], [B, 1], [D5, 2],   [C5, 1], [A, 1], [Fs, 2],   [G, 1], [A, 1], [B, 1], [C5, 1],   [D5, 2], [null, 2]];
const echoB: Step[] = [[B, 1], [A, 1], [G, 1], [Fs, 1],   [G, 1], [B, 1], [A, 2],   [Fs, 1], [A, 1], [D5, 1], [C5, 1],   [G, 2], [null, 2]];
const echoChordsA: [number, string][] = [[0, 'G'], [4, 'D7'], [8, 'G'], [12, 'G']];
const echoChordsB: [number, string][] = [[0, 'G'], [6, 'D'], [8, 'D'], [12, 'G']];

const RULES = {
  hand: 'right' as const,
  modes: ['discover', 'flow', 'challenge'] as const,
  completion: { minNoteAccuracy: 0.5 },
  stars: { two: 0.8, three: 0.95 },
};
function level(number: number, title: string, objective: string, songDef: SongDefinition): LevelDefinition {
  return { id: songDef.id, world: 3, number, title, objective, song: songDef, ...RULES };
}

export const WORLD_3: WorldDefinition = {
  id: 3,
  kind: 'path',
  title: 'Melody Mountain',
  subtitle: 'Wider range, big jumps and your first black keys',
  levels: [
    level(1, 'Reach Up', 'A sixth key: stretch your pinky up to A.', fromTune('w3-reach-up', TWINKLE, 92, 'pop', { fingers: [1, 2, 3, 4, 5, 5] })),
    level(2, 'Full Octave', 'Walk the whole scale, C5 down to C4.', fromTune('w3-full-octave', JOY_TO_THE_WORLD, 108, 'groove')),
    level(3, 'Wide Waltz', 'A gentle 3/4 melody across a full octave.', fromTune('w3-wide-waltz', BRAHMS_LULLABY, 84, 'waltz', { timeSignature: [3, 4] })),
    level(4, 'Big Jumps', 'Leap across the keyboard without looking down.', fromTune('w3-big-jumps', AMAZING_GRACE, 80, 'waltz', { timeSignature: [3, 4], preferFlats: true })),
    level(5, 'Hand Shift', 'Move your hand from C position up to G position and back.', song('w3-hand-shift', 'Mountain Path', 100, mountainPath, {
      style: 'pop',
      chords: [[0, 'C'], [8, 'Dm'], [12, 'G'], [16, 'G'], [24, 'Am'], [28, 'G'], [32, 'C'], [36, 'Dm'], [38, 'G'], [40, 'C'], [44, 'F'], [46, 'C'], [48, 'G'], [52, 'Em'], [56, 'G7'], [60, 'C']],
    })),
    level(6, 'First Black Key', 'B-flat: Ode to Joy in F position.', song('w3-first-black-key', 'Ode to Joy (in F)', 110, transposeSteps(ODE_TO_JOY.steps, 5), {
      style: 'dance',
      chords: transposeChords(ODE_TO_JOY.chords, 5),
    }, { composer: ODE_TO_JOY.credit, fingers: [1, 2, 3, 4, 5], preferFlats: true })),
    level(7, 'F-Sharp', 'G position and the F-sharp just below it.', song('w3-f-sharp', 'Sunrise', 100, sunrise, {
      style: 'dance',
      chords: [[0, 'G'], [4, 'D7'], [8, 'G'], [24, 'D'], [28, 'G'], [34, 'C'], [36, 'G'], [38, 'Am'], [40, 'D'], [44, 'G'], [46, 'D'], [48, 'G'], [52, 'D7'], [56, 'G'], [59, 'D7'], [60, 'G']],
    }, { fingers: G_POSITION_FINGERS })),
    level(8, 'Two Black Keys', 'G-sharp and F-sharp in a minor-key ballad.', fromTune('w3-two-black-keys', GREENSLEEVES, 92, 'waltz', { timeSignature: [3, 4] })),
    level(9, 'Echo Mountain', 'Play each phrase again from memory, black key included.', song('w3-echo-mountain', 'Echo Mountain', 96, [...echoA, ...echoA, ...echoB, ...echoB], {
      style: 'dance',
      chords: [
        ...echoChordsA,
        ...echoChordsA.map(([b, c]) => [b + 16, c] as [number, string]),
        ...echoChordsB.map(([b, c]) => [b + 32, c] as [number, string]),
        ...echoChordsB.map(([b, c]) => [b + 48, c] as [number, string]),
      ],
    }, { fingers: G_POSITION_FINGERS, assist: { fadeRanges: [[16, 32], [48, 64]] } })),
    level(10, 'The Summit', 'Für Elise: D-sharp, G-sharp and a whole lot of range.', fromTune('w3-summit', FUR_ELISE, 84, 'gentle', { timeSignature: [3, 4] })),
  ],
};
