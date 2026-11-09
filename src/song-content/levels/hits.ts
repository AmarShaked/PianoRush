import type { LevelDefinition, WorldDefinition } from '../level';
import { SONG_SCHEMA_VERSION, type BackingStyle, type SongDefinition } from '../schema';
import { sequence } from '../notation';
import { fiveFingerFingering } from '../parts';
import {
  AMAZING_GRACE,
  BRAHMS_LULLABY,
  FUR_ELISE,
  GREENSLEEVES,
  JOY_TO_THE_WORLD,
  AU_CLAIR,
  AUNT_RHODY,
  HOT_CROSS_BUNS,
  LIGHTLY_ROW,
  LONDON_BRIDGE,
  JINGLE_BELLS,
  MARY,
  ODE_TO_JOY_ORIGINAL_RHYTHM,
  SAINTS,
  TWINKLE,
  type PublicDomainTune,
} from '../songs/publicDomain';

import danceMonkeyData from '../songs/licensed/dance-monkey.json';
import loveTonightData from '../songs/licensed/love-tonight.json';

/*
 * Hits — famous songs for free play, open from the start: licensed hits
 * (imported from the owner's licensed MIDI files) and public-domain classics.
 * Faster tempos and full-energy arrangements; separate progress from World 1.
 */

function hit(
  id: string,
  tune: PublicDomainTune,
  bpm: number,
  style: BackingStyle,
  objective: string,
  number: number,
  meter: readonly [number, number] = [4, 4],
): LevelDefinition {
  const song: SongDefinition = {
    schemaVersion: SONG_SCHEMA_VERSION,
    id,
    title: tune.title,
    composer: tune.credit,
    bpm,
    timeSignature: meter,
    countInBeats: meter[0] === 3 ? 6 : 4,
    lanes: tune.lanes,
    fingers: fiveFingerFingering(tune.lanes, 'right', 60),
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

/** A licensed hit, converted from MIDI by the importer (see song-content/midi). */
function licensedHit(id: string, data: unknown, objective: string, number: number): LevelDefinition {
  const song = { ...(data as SongDefinition), id };
  return {
    id,
    world: 0,
    number,
    title: song.title,
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
    licensedHit('hits-dance-monkey', danceMonkeyData, 'The 2019 smash, over a full dance beat (F# minor).', 0),
    licensedHit('hits-love-tonight', loveTonightData, 'The Lion King love theme: hook, strings melody, hook again.', 0),
    hit('hits-ode-to-joy', ODE_TO_JOY_ORIGINAL_RHYTHM, 120, 'dance', "Beethoven's melody, with its real dotted rhythm.", 1),
    hit('hits-jingle-bells', JINGLE_BELLS, 126, 'pop', 'The full-speed sleigh ride.', 2),
    hit('hits-saints', SAINTS, 120, 'groove', 'Swing those long notes.', 3),
    hit('hits-au-clair', AU_CLAIR, 112, 'dance', 'Three keys, full club mix.', 4),
    hit('hits-mary', MARY, 116, 'pop', 'Four keys: C D E and a jump to G.', 5),
    hit('hits-twinkle', TWINKLE, 96, 'pop', 'Six keys — reach up to A with your pinky (H key).', 6),
    hit('hits-london-bridge', LONDON_BRIDGE, 116, 'dance', 'Six keys with a dotted bounce.', 7),
    hit('hits-lightly-row', LIGHTLY_ROW, 112, 'dance', 'Glide through the long notes.', 8),
    hit('hits-aunt-rhody', AUNT_RHODY, 120, 'groove', 'An old folk tune with a new groove.', 9),
    hit('hits-hot-cross-buns', HOT_CROSS_BUNS, 120, 'pop', 'Three keys, quick eighth notes.', 10),
    hit('hits-joy-to-the-world', JOY_TO_THE_WORLD, 116, 'dance', 'A full octave, top to bottom.', 11),
    hit('hits-brahms-lullaby', BRAHMS_LULLABY, 92, 'waltz', 'A gentle waltz across the octave.', 12, [3, 4]),
    hit('hits-amazing-grace', AMAZING_GRACE, 88, 'waltz', 'Big, singing leaps.', 13, [3, 4]),
    hit('hits-greensleeves', GREENSLEEVES, 92, 'waltz', 'Minor key, two black keys.', 14, [3, 4]),
    hit('hits-fur-elise', FUR_ELISE, 92, 'gentle', 'The most famous opening in piano music.', 15, [3, 4]),
  ],
};
