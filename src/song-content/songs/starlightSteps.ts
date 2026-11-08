import { sequence, type Step } from '../notation';
import { SONG_SCHEMA_VERSION, type SongDefinition } from '../schema';

/*
 * "Starlight Steps" — an original melody written for Piano Rush.
 *
 * Five-finger position, right hand, C4–G4. 16 bars of 4/4 at 100 BPM
 * (~38 s + count-in), form A A' B A''.
 *  - A   : rising C–E–G arpeggio answered by a stepwise fall, half cadence on D
 *  - A'  : same opening, resolves home to C
 *  - B   : eighth-note motion, sequence descending from G, builds to the dominant
 *  - A'' : opening returns, final G–F–E–D–C scale run home
 */

const C = 60;
const D = 62;
const E = 64;
const F = 65;
const G = 67;
const REST = null;

const phraseA: Step[] = [
  [C, 1], [E, 1], [G, 2],
  [F, 1], [E, 1], [D, 2],
  [E, 1], [F, 1], [G, 1], [E, 1],
  [D, 3], [REST, 1],
];

const phraseA2: Step[] = [
  [C, 1], [E, 1], [G, 2],
  [F, 1], [E, 1], [D, 1], [E, 1],
  [F, 1], [D, 1], [E, 0.5], [D, 0.5], [C, 1],
  [C, 3], [REST, 1],
];

const phraseB: Step[] = [
  [G, 0.5], [F, 0.5], [E, 1], [G, 0.5], [F, 0.5], [E, 1],
  [D, 0.5], [E, 0.5], [F, 1], [E, 1], [D, 1],
  [E, 0.5], [F, 0.5], [G, 1], [F, 0.5], [E, 0.5], [D, 1],
  [D, 2], [G, 2],
];

const phraseA3: Step[] = [
  [C, 1], [E, 1], [G, 2],
  [F, 1], [E, 1], [D, 1], [F, 1],
  [G, 1], [F, 1], [E, 1], [D, 1],
  [C, 3],
];

export const starlightSteps: SongDefinition = {
  schemaVersion: SONG_SCHEMA_VERSION,
  id: 'starlight-steps',
  title: 'Starlight Steps',
  composer: 'Piano Rush Original',
  bpm: 100,
  timeSignature: [4, 4],
  countInBeats: 4,
  lanes: [C, D, E, F, G],
  notes: sequence([...phraseA, ...phraseA2, ...phraseB, ...phraseA3]),
  difficulty: { level: 1, skills: ['five-finger-position', 'quarter-notes', 'eighth-notes', 'held-notes'] },
};
