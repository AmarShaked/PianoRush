import type { Step } from '../notation';
import type { BackingSpec } from '../schema';

/*
 * Well-known melodies in the public domain, transcribed from the traditional
 * tunes (not from any modern arrangement), set in C so they fit the
 * five-finger position from middle C. Harmonies are written for Piano Rush.
 *
 * Every chord list obeys the consonance rule enforced by the content tests:
 * melody notes on strong beats, or two beats and longer, are chord tones.
 */

const C = 60;
const D = 62;
const E = 64;
const F = 65;
const G = 67;
const A = 69;
const R = null;

type Chords = BackingSpec['chords'];

export interface PublicDomainTune {
  readonly title: string;
  /** Composer / origin, with the reason it is public domain. */
  readonly credit: string;
  readonly lanes: readonly number[];
  readonly steps: readonly Step[];
  readonly chords: Chords;
}

/** Au Clair de la Lune — French folk song, 18th century. Three keys: C D E. */
const auClairPhrase: Step[] = [[C, 1], [C, 1], [C, 1], [D, 1], [E, 2], [D, 2], [C, 1], [E, 1], [D, 1], [D, 1], [C, 4]];
export const AU_CLAIR: PublicDomainTune = {
  title: 'Au Clair de la Lune',
  credit: 'Traditional French (18th c.) · public domain',
  lanes: [C, D, E],
  steps: [...auClairPhrase, ...auClairPhrase, ...auClairPhrase, ...auClairPhrase],
  chords: [
    [0, 'C'], [4, 'C'], [6, 'G'], [8, 'C'], [10, 'G'], [12, 'C'],
    [16, 'F'], [20, 'C'], [22, 'G'], [24, 'Am'], [26, 'G'], [28, 'C'],
    [32, 'C'], [36, 'C'], [38, 'G'], [40, 'C'], [42, 'G7'], [44, 'C'],
    [48, 'F'], [52, 'C'], [54, 'G'], [56, 'Am'], [58, 'G7'], [60, 'C'],
  ],
};

/** Ode to Joy — Ludwig van Beethoven, Symphony No. 9 (1824). Beginner rhythm (no dotted notes). */
const odeA: Step[] = [[E, 1], [E, 1], [F, 1], [G, 1], [G, 1], [F, 1], [E, 1], [D, 1], [C, 1], [C, 1], [D, 1], [E, 1]];
const ODE_CHORDS: Chords = [
  [0, 'C'], [2, 'F'], [4, 'Em'], [8, 'C'], [10, 'G'], [12, 'C'], [14, 'G'],
  [16, 'C'], [18, 'F'], [20, 'Em'], [24, 'C'], [26, 'G'], [28, 'G'], [30, 'C'],
  [32, 'Am'], [34, 'F'], [36, 'C'], [40, 'F'], [42, 'G'], [44, 'C'], [46, 'G'],
  [48, 'Am'], [50, 'F'], [52, 'Em'], [56, 'F'], [58, 'G7'], [60, 'G'], [62, 'C'],
];
export const ODE_TO_JOY: PublicDomainTune = {
  title: 'Ode to Joy',
  credit: 'Ludwig van Beethoven (1824) · public domain',
  lanes: [C, D, E, F, G],
  steps: [
    ...odeA, [E, 1], [D, 1], [D, 2],
    ...odeA, [D, 1], [C, 1], [C, 2],
    ...odeA, [E, 1], [D, 1], [D, 2],
    ...odeA, [D, 1], [C, 1], [C, 2],
  ],
  chords: ODE_CHORDS,
};

/** Ode to Joy with Beethoven's dotted rhythm (Hits version). */
export const ODE_TO_JOY_ORIGINAL_RHYTHM: PublicDomainTune = {
  ...ODE_TO_JOY,
  steps: [
    ...odeA, [E, 1.5], [D, 0.5], [D, 2],
    ...odeA, [D, 1.5], [C, 0.5], [C, 2],
    ...odeA, [E, 1.5], [D, 0.5], [D, 2],
    ...odeA, [D, 1.5], [C, 0.5], [C, 2],
  ],
};

/** When the Saints Go Marching In — African-American spiritual (traditional). Long notes. */
export const SAINTS: PublicDomainTune = {
  title: 'When the Saints Go Marching In',
  credit: 'Traditional spiritual · public domain',
  lanes: [C, D, E, F, G],
  steps: [
    [R, 1], [C, 1], [E, 1], [F, 1],   [G, 4],
    [R, 1], [C, 1], [E, 1], [F, 1],   [G, 4],
    [R, 1], [C, 1], [E, 1], [F, 1],   [G, 2], [E, 2],   [C, 2], [E, 2],   [D, 4],
    [R, 1], [E, 1], [E, 1], [D, 1],   [C, 3], [C, 1],   [E, 2], [G, 2],   [G, 1], [F, 3],
    [R, 1], [E, 1], [F, 1], [G, 1],   [E, 2], [C, 2],   [D, 4],           [C, 4],
  ],
  chords: [
    [0, 'C'], [12, 'Em'], [16, 'C'], [24, 'Am'], [28, 'G'],
    [32, 'C'], [36, 'C7'], [40, 'C'], [44, 'C'], [45, 'F'], [48, 'F'], [52, 'C'], [56, 'G7'], [60, 'C'],
  ],
};

/** Jingle Bells (chorus) — James Lord Pierpont (1857). Eighths and dotted rhythms. */
export const JINGLE_BELLS: PublicDomainTune = {
  title: 'Jingle Bells',
  credit: 'James Lord Pierpont (1857) · public domain',
  lanes: [C, D, E, F, G],
  steps: [
    [E, 1], [E, 1], [E, 2],   [E, 1], [E, 1], [E, 2],   [E, 1], [G, 1], [C, 1.5], [D, 0.5],   [E, 4],
    [F, 1], [F, 1], [F, 1.5], [F, 0.5],   [F, 1], [E, 1], [E, 1], [E, 0.5], [E, 0.5],   [E, 1], [D, 1], [D, 1], [E, 1],   [D, 2], [G, 2],
    [E, 1], [E, 1], [E, 2],   [E, 1], [E, 1], [E, 2],   [E, 1], [G, 1], [C, 1.5], [D, 0.5],   [E, 4],
    [F, 1], [F, 1], [F, 1], [F, 1],   [F, 1], [E, 1], [E, 1], [E, 0.5], [E, 0.5],   [G, 1], [G, 1], [F, 1], [D, 1],   [C, 4],
  ],
  chords: [
    [0, 'C'], [16, 'F'], [20, 'F'], [22, 'C'], [24, 'C'], [26, 'G'], [28, 'G'],
    [32, 'C'], [48, 'F'], [52, 'F'], [54, 'C'], [56, 'G7'], [60, 'C'],
  ],
};

/** Mary Had a Little Lamb — traditional American (1830s). Keys C D E G. */
const maryHalf: Step[] = [
  [E, 1], [D, 1], [C, 1], [D, 1],   [E, 1], [E, 1], [E, 2],   [D, 1], [D, 1], [D, 2],   [E, 1], [G, 1], [G, 2],
  [E, 1], [D, 1], [C, 1], [D, 1],   [E, 1], [E, 1], [E, 1], [E, 1],   [D, 1], [D, 1], [E, 1], [D, 1],   [C, 4],
];
export const MARY: PublicDomainTune = {
  title: 'Mary Had a Little Lamb',
  credit: 'Traditional American (1830s) · public domain',
  lanes: [C, D, E, G],
  steps: [...maryHalf, ...maryHalf],
  chords: [
    [0, 'C'], [8, 'G'], [12, 'C'], [24, 'G'], [26, 'C'],
    [32, 'C'], [36, 'Am'], [40, 'G'], [44, 'C'], [56, 'G'], [58, 'C'],
  ],
};

/** Twinkle Twinkle Little Star — "Ah! vous dirai-je, maman" (French, 1761). Six keys C–A. */
const twinkleA: Step[] = [[C, 1], [C, 1], [G, 1], [G, 1], [A, 1], [A, 1], [G, 2], [F, 1], [F, 1], [E, 1], [E, 1], [D, 1], [D, 1], [C, 2]];
const twinkleB: Step[] = [[G, 1], [G, 1], [F, 1], [F, 1], [E, 1], [E, 1], [D, 2]];
export const TWINKLE: PublicDomainTune = {
  title: 'Twinkle Twinkle Little Star',
  credit: 'Traditional French (1761) · public domain',
  lanes: [C, D, E, F, G, A],
  steps: [...twinkleA, ...twinkleB, ...twinkleB, ...twinkleA],
  chords: [
    [0, 'C'], [4, 'F'], [6, 'C'], [8, 'F'], [10, 'C'], [12, 'G'], [14, 'C'],
    [16, 'C'], [18, 'F'], [20, 'C'], [22, 'G'], [24, 'C'], [26, 'F'], [28, 'C'], [30, 'G'],
    [32, 'C'], [36, 'F'], [38, 'C'], [40, 'F'], [42, 'C'], [44, 'G'], [46, 'C'],
  ],
};
