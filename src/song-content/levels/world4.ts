import type { WorldDefinition } from '../level';
import { notesFromSteps, fiveFingerFingering } from '../parts';
import type { Step } from '../notation';
import { SONG_SCHEMA_VERSION, type SongDefinition } from '../schema';
import { MARY } from '../songs/publicDomain';
import { derivedLevel, leftHandVersion } from './derived';
import { WORLD_1 } from './world1';
import { WORLD_2 } from './world2';

/*
 * World 4 — Left Hand Land (PRD §7.1). The left hand takes over: little
 * finger on C3, one finger per key up to G3 (5-4-3-2-1). The melodies are ones
 * the right hand already knows, so the only new thing is the hand. The band
 * moves its chords above the left hand so nothing gets in the way.
 */

const w1 = (n: number) => WORLD_1.levels[n - 1]!.song;
const w2 = (n: number) => WORLD_2.levels[n - 1]!.song;

const C3 = 48;
const D3 = 50;
const E3 = 52;
const F3 = 53;
const G3 = 55;

// 7 — Bass Line (original): a walking bass — the left hand's natural job.
const walkA: Step[] = [
  [C3, 1], [E3, 1], [G3, 1], [E3, 1],   [C3, 1], [D3, 1], [E3, 1], [G3, 1],   [F3, 1], [G3, 1], [F3, 1], [E3, 1],   [C3, 1], [E3, 1], [G3, 1], [E3, 1],
  [G3, 1], [F3, 1], [D3, 1], [F3, 1],   [F3, 1], [E3, 1], [F3, 1], [G3, 1],   [C3, 1], [D3, 1], [E3, 1], [C3, 1],   [G3, 2], [D3, 2],
];
const walkEnd: Step[] = [
  [C3, 1], [E3, 1], [G3, 1], [E3, 1],   [C3, 1], [D3, 1], [E3, 1], [G3, 1],   [F3, 1], [G3, 1], [F3, 1], [E3, 1],   [C3, 1], [E3, 1], [G3, 1], [E3, 1],
  [G3, 1], [F3, 1], [D3, 1], [F3, 1],   [F3, 1], [E3, 1], [F3, 1], [G3, 1],   [G3, 1], [F3, 1], [D3, 1], [G3, 1],   [C3, 4],
];
const walkChordsA: [number, string][] = [[0, 'C'], [8, 'F'], [12, 'C'], [16, 'G'], [20, 'F'], [24, 'C'], [28, 'G']];
const bassLine: SongDefinition = (() => {
  const notes = notesFromSteps([...walkA, ...walkEnd], 'left');
  const lanes = [C3, D3, E3, F3, G3];
  return {
    schemaVersion: SONG_SCHEMA_VERSION,
    id: 'w4-bass-line',
    title: 'Walking the Dog',
    composer: 'Piano Rush Original',
    bpm: 100,
    timeSignature: [4, 4],
    countInBeats: 4,
    lanes,
    notes,
    holdMinBeats: 1.5,
    fingers: fiveFingerFingering(lanes, 'left', 48),
    backing: {
      style: 'groove',
      chords: [...walkChordsA, ...walkChordsA.map(([b, c]) => [b + 32, c] as [number, string]).slice(0, 5), [56, 'G'], [60, 'C']],
      omit: ['bass'],
    },
  };
})();

const maryLeft: SongDefinition = leftHandVersion(
  {
    schemaVersion: SONG_SCHEMA_VERSION,
    id: 'mary',
    title: MARY.title,
    composer: MARY.credit,
    bpm: 108,
    timeSignature: [4, 4],
    countInBeats: 4,
    lanes: MARY.lanes,
    notes: notesFromSteps(MARY.steps, 'right'),
    backing: { style: 'pop', chords: MARY.chords },
  },
  'w4-left-jumps',
  108,
);

export const WORLD_4: WorldDefinition = {
  id: 4,
  kind: 'path',
  title: 'Left Hand Land',
  subtitle: 'Little finger on C3 — the left hand takes the lead',
  levels: [
    derivedLevel(4, 1, 'Left Steps', 'Three keys with the left hand: C3 D3 E3 (fingers 5 4 3).', 'left', leftHandVersion(w1(3), 'w4-left-steps', 96)),
    derivedLevel(4, 2, 'Left Hand Five', 'All five left-hand fingers, C3 to G3.', 'left', leftHandVersion(w1(5), 'w4-left-five', 104)),
    derivedLevel(4, 3, 'Low & Long', 'Hold long notes with the left hand.', 'left', leftHandVersion(w2(2), 'w4-low-long', 100)),
    derivedLevel(4, 4, 'Left Rests', 'Count the rests — left hand.', 'left', leftHandVersion(w2(3), 'w4-left-rests', 96)),
    derivedLevel(4, 5, 'Left Waltz', 'Three beats in a bar, left hand.', 'left', leftHandVersion(w2(5), 'w4-left-waltz', 126)),
    derivedLevel(4, 6, 'Left Rhythm', 'Quick, dotted rhythms in the left hand.', 'left', leftHandVersion(w1(8), 'w4-left-rhythm', 104)),
    derivedLevel(4, 7, 'Bass Line', 'Walk a bass line — the left hand’s natural job.', 'left', bassLine),
    derivedLevel(4, 8, 'Left Jumps', 'Skip from E3 up to G3 and back.', 'left', maryLeft),
    derivedLevel(4, 9, 'Left Memory', 'Repeat each phrase from memory, left hand.', 'left', leftHandVersion(w1(9), 'w4-left-memory', 92)),
    derivedLevel(4, 10, 'Left Finale', 'A whole piece in the left hand.', 'left', leftHandVersion(w1(10), 'w4-left-finale', 100)),
  ],
};
