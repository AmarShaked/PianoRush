import type { WorldDefinition } from '../level';
import { notesFromSteps } from '../parts';
import { SONG_SCHEMA_VERSION, type SongDefinition } from '../schema';
import { HOT_CROSS_BUNS, MARY } from '../songs/publicDomain';
import { derivedLevel, twoHandVersion } from './derived';
import { WORLD_1 } from './world1';
import { WORLD_2 } from './world2';

/*
 * World 6 — Two Hands Festival (PRD §7.1: coordinated two-hand playing).
 * Right hand: melodies from earlier worlds (C4–G4). Left hand: C3–G3, first
 * answering the right hand, then holding bass notes under it, then moving in
 * rhythm with it. The band leaves out its bass — that's the player's job now.
 */

const w1 = (n: number) => WORLD_1.levels[n - 1]!.song;
const w2 = (n: number) => WORLD_2.levels[n - 1]!.song;

function pdSong(tune: typeof MARY, bpm: number): SongDefinition {
  return {
    schemaVersion: SONG_SCHEMA_VERSION,
    id: tune.title,
    title: tune.title,
    composer: tune.credit,
    bpm,
    timeSignature: [4, 4],
    countInBeats: 4,
    lanes: tune.lanes,
    notes: notesFromSteps(tune.steps, 'right'),
    backing: { style: 'pop', chords: tune.chords },
  };
}

export const WORLD_6: WorldDefinition = {
  id: 6,
  kind: 'path',
  title: 'Two Hands Festival',
  subtitle: 'Left hand on C3, right hand on C4 — together at last',
  levels: [
    derivedLevel(6, 1, 'Hand to Hand', 'Call and response: the left hand echoes each right-hand phrase.', 'right', twoHandVersion(w1(3), 'w6-hand-to-hand', 96, 'echo')),
    derivedLevel(6, 2, 'Bass & Melody', 'Hold one bass note per bar under Ode to Joy.', 'right', twoHandVersion(w1(5), 'w6-bass-melody', 96, 'whole')),
    derivedLevel(6, 3, 'Half-Note Bass', 'Two bass notes per bar under Lightly Row.', 'right', twoHandVersion(w2(2), 'w6-half-bass', 92, 'half')),
    derivedLevel(6, 4, 'Long & Low', 'Long notes in both hands: When the Saints.', 'right', twoHandVersion(w1(6), 'w6-long-low', 100, 'whole')),
    derivedLevel(6, 5, 'Waltz for Two', 'Left hand on beat one, right hand sings: a two-hand waltz.', 'right', twoHandVersion(w2(5), 'w6-waltz', 120, 'waltz')),
    derivedLevel(6, 6, 'Steady Bass', 'Keep the left hand steady while the right hand jingles.', 'right', twoHandVersion(w1(8), 'w6-steady-bass', 96, 'half')),
    derivedLevel(6, 7, 'Together', 'Both hands play the same notes, an octave apart.', 'right', twoHandVersion(pdSong(HOT_CROSS_BUNS, 96), 'w6-together', 96, 'unison')),
    derivedLevel(6, 8, 'Root & Fifth', 'Left hand alternates root and fifth under Mary.', 'right', twoHandVersion(pdSong(MARY, 100), 'w6-root-fifth', 100, 'root-fifth')),
    derivedLevel(6, 9, 'Two-Hand Memory', 'Both hands, from memory, on the repeats.', 'right', twoHandVersion(w1(9), 'w6-memory', 92, 'whole')),
    derivedLevel(6, 10, 'Festival Finale', 'Starlight Steps with a moving bass — the grand finale.', 'right', twoHandVersion(w1(10), 'w6-finale', 96, 'root-fifth')),
  ],
};
