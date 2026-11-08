import type { WorldDefinition } from '../level';
import { chordPart, type ChordPattern } from '../parts';
import { SONG_SCHEMA_VERSION, type SongDefinition } from '../schema';
import { AU_CLAIR, HOT_CROSS_BUNS, JINGLE_BELLS, LIGHTLY_ROW, MARY, ODE_TO_JOY, TWINKLE, type PublicDomainTune } from '../songs/publicDomain';
import { notesFromSteps } from '../parts';
import { accompanimentVersion, derivedLevel } from './derived';

/*
 * World 5 — Chord City (PRD §7.1: chords and accompaniment patterns).
 * Two notes at once, then fifths, the C triad, the three primary chords
 * (C, F, G in easy inversions), rhythmic chords, broken chords and Alberti
 * bass. From level 4 the band plays a famous tune as the lead melody while the
 * player accompanies it — the player's part is the harmony, never the tune.
 */

function tuneSong(tune: PublicDomainTune, bpm: number): SongDefinition {
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

/** Original chord-only levels (1–3): a progression played in a given voicing set. */
function chordStudy(
  id: string,
  title: string,
  bpm: number,
  progression: string[],
  beatsPerChord: number,
  voicings: Record<string, number[]>,
  pattern: ChordPattern,
  style: 'pop' | 'dance',
): SongDefinition {
  const chords = progression.map((c, i) => [i * beatsPerChord, c] as [number, string]);
  const end = progression.length * beatsPerChord;
  const lanes = [...new Set(Object.values(voicings).flat())].sort((a, b) => a - b);
  const notes = chordPart(chords, end, 4, lanes, pattern, 'right', voicings);
  const used = [...new Set(notes.map((n) => n.midi))].sort((a, b) => a - b);
  return {
    schemaVersion: SONG_SCHEMA_VERSION,
    id,
    title,
    composer: 'Piano Rush Original',
    bpm,
    timeSignature: [4, 4],
    countInBeats: 4,
    lanes: used,
    notes,
    holdMinBeats: 1.5,
    backing: { style, chords, omit: ['pad', 'keys'] },
  };
}

const thirdsPhrase = ['C', 'Dm', 'Em', 'Dm', 'C', 'Em', 'Dm', 'Dm', 'C', 'Dm', 'Em', 'Em', 'Dm', 'Dm', 'C', 'C'];
const fifthsPhrase = ['C', 'F', 'G', 'C', 'C', 'F', 'G', 'G'];
const triadPhrase = ['C', 'C', 'F', 'C', 'G', 'G', 'C', 'C', 'C', 'F', 'C', 'F', 'G', 'G', 'C', 'C'];

export const WORLD_5: WorldDefinition = {
  id: 5,
  kind: 'path',
  title: 'Chord City',
  subtitle: 'Play the harmony — the band plays the tune',
  levels: [
    derivedLevel(5, 1, 'Two at Once', 'Two keys together: thirds (C+E, D+F, E+G).', 'right',
      chordStudy('w5-two-at-once', 'Side by Side', 100, [...thirdsPhrase, ...thirdsPhrase], 2, { C: [60, 64], Dm: [62, 65], Em: [64, 67] }, 'block', 'pop')),
    derivedLevel(5, 2, 'Power Pairs', 'Open sounds: C+G, C+F and D+G.', 'right',
      chordStudy('w5-power-pairs', 'Power Pairs', 104, [...fifthsPhrase, ...fifthsPhrase], 4, { C: [60, 67], F: [60, 65], G: [62, 67] }, 'pop', 'dance')),
    derivedLevel(5, 3, 'First Triad', 'Three keys at once: the C major chord C–E–G.', 'right',
      chordStudy('w5-first-triad', 'Three of a Kind', 100, [...triadPhrase, ...triadPhrase], 2, { C: [60, 64, 67], F: [60, 65], G: [62, 67] }, 'block', 'pop')),
    derivedLevel(5, 4, 'Three Chords', 'C, F and G — the three chords behind thousands of songs.', 'right',
      accompanimentVersion(tuneSong(AU_CLAIR, 96), 'w5-three-chords', 96, 'block', 'pop')),
    derivedLevel(5, 5, 'Chord Rhythm', 'Play the chords in a pop rhythm: 1, and-of-2, 4.', 'right',
      accompanimentVersion(tuneSong(MARY, 100), 'w5-chord-rhythm', 100, 'pop', 'dance')),
    derivedLevel(5, 6, 'Broken Chords', 'One chord tone per beat: low, middle, high, middle.', 'right',
      accompanimentVersion(tuneSong(TWINKLE, 92), 'w5-broken-chords', 92, 'broken', 'pop')),
    derivedLevel(5, 7, 'Alberti Bass', 'The classic pattern: low–high–middle–high in eighths.', 'right',
      accompanimentVersion(tuneSong(LIGHTLY_ROW, 84), 'w5-alberti', 84, 'alberti', 'groove')),
    derivedLevel(5, 8, 'Accompany Ode to Joy', 'Keep steady chords on every beat under the melody.', 'right',
      accompanimentVersion(tuneSong(ODE_TO_JOY, 100), 'w5-accompany-ode', 100, 'beats', 'dance')),
    derivedLevel(5, 9, 'Chord Memory', 'The second half fades: play the progression from memory.', 'right', {
      ...accompanimentVersion(tuneSong(HOT_CROSS_BUNS, 100), 'w5-chord-memory', 100, 'pop', 'pop'),
      assist: { fadeRanges: [[32, 64]] },
    }),
    derivedLevel(5, 10, 'Chord City Finale', 'Jingle Bells: rhythm chords, then Alberti bass.', 'right',
      accompanimentVersion(tuneSong(JINGLE_BELLS, 100), 'w5-finale', 100, (beat) => (beat < 32 ? 'pop' : 'alberti'), 'dance')),
  ],
};
