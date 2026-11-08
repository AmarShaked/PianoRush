import type { LevelDefinition, WorldDefinition } from '../level';
import { SONG_SCHEMA_VERSION, type BackingStyle, type SongDefinition } from '../schema';
import { sequence } from '../notation';
import {
  AU_CLAIR,
  JINGLE_BELLS,
  MARY,
  ODE_TO_JOY_ORIGINAL_RHYTHM,
  SAINTS,
  TWINKLE,
  type PublicDomainTune,
} from '../songs/publicDomain';

/*
 * Hits — famous public-domain songs for free play, open from the start.
 * Faster tempos and full-energy arrangements; separate progress from World 1.
 */

function hit(id: string, tune: PublicDomainTune, bpm: number, style: BackingStyle, objective: string, number: number): LevelDefinition {
  const song: SongDefinition = {
    schemaVersion: SONG_SCHEMA_VERSION,
    id,
    title: tune.title,
    composer: tune.credit,
    bpm,
    timeSignature: [4, 4],
    countInBeats: 4,
    lanes: tune.lanes,
    notes: sequence(tune.steps),
    holdMinBeats: 1.5,
    backing: { style, chords: tune.chords },
  };
  return {
    id,
    world: 0,
    number,
    title: tune.title,
    objective,
    hand: 'right',
    song,
    modes: ['discover', 'flow', 'challenge'],
    completion: { minNoteAccuracy: 0.5 },
    stars: { two: 0.8, three: 0.95 },
  };
}

export const HITS: WorldDefinition = {
  id: 0,
  kind: 'freeplay',
  title: 'Hits',
  subtitle: 'Famous songs, free play — all open',
  levels: [
    hit('hits-ode-to-joy', ODE_TO_JOY_ORIGINAL_RHYTHM, 120, 'dance', "Beethoven's melody, with its real dotted rhythm.", 1),
    hit('hits-jingle-bells', JINGLE_BELLS, 126, 'pop', 'The full-speed sleigh ride.', 2),
    hit('hits-saints', SAINTS, 120, 'groove', 'Swing those long notes.', 3),
    hit('hits-au-clair', AU_CLAIR, 112, 'dance', 'Three keys, full club mix.', 4),
    hit('hits-mary', MARY, 116, 'pop', 'Four keys: C D E and a jump to G.', 5),
    hit('hits-twinkle', TWINKLE, 96, 'pop', 'Six keys — reach up to A with your pinky (H key).', 6),
  ],
};
