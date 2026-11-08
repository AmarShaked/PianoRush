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

/** Lightly Row ("Hänschen klein") — German folk song (19th c.). Half and whole notes. */
const lightlyA: Step[] = [[G, 1], [E, 1], [E, 2], [F, 1], [D, 1], [D, 2], [C, 1], [D, 1], [E, 1], [F, 1], [G, 1], [G, 1], [G, 2]];
const lightlyEnd: Step[] = [[G, 1], [E, 1], [E, 2], [F, 1], [D, 1], [D, 2], [C, 1], [E, 1], [G, 1], [G, 1], [C, 4]];
export const LIGHTLY_ROW: PublicDomainTune = {
  title: 'Lightly Row',
  credit: 'German folk song (19th c.) · public domain',
  lanes: [C, D, E, F, G],
  steps: [
    ...lightlyA, ...lightlyEnd,
    [D, 1], [D, 1], [D, 1], [D, 1], [D, 1], [E, 1], [F, 2],
    [E, 1], [E, 1], [E, 1], [E, 1], [E, 1], [F, 1], [G, 2],
    ...lightlyEnd,
  ],
  chords: [[0, 'C'], [4, 'G7'], [8, 'C'], [12, 'G'], [16, 'C'], [20, 'G7'], [24, 'C'], [32, 'G7'], [40, 'C'], [48, 'C'], [52, 'G7'], [56, 'C']],
};

/** Hot Cross Buns — English street cry (18th c.). Three keys, eighth notes. */
const bunsA: Step[] = [
  [E, 1], [D, 1], [C, 2],   [E, 1], [D, 1], [C, 2],
  [C, 0.5], [C, 0.5], [C, 0.5], [C, 0.5], [D, 0.5], [D, 0.5], [D, 0.5], [D, 0.5],   [E, 1], [D, 1], [C, 2],
];
const bunsB: Step[] = [
  [E, 1], [D, 1], [C, 2],   [E, 1], [D, 1], [C, 2],
  [E, 0.5], [E, 0.5], [E, 0.5], [E, 0.5], [D, 0.5], [D, 0.5], [D, 0.5], [D, 0.5],   [E, 1], [D, 1], [C, 2],
];
export const HOT_CROSS_BUNS: PublicDomainTune = {
  title: 'Hot Cross Buns',
  credit: 'English street cry (18th c.) · public domain',
  lanes: [C, D, E],
  steps: [...bunsA, ...bunsB, ...bunsA, ...bunsB],
  chords: [
    [0, 'C'], [4, 'Am'], [8, 'F'], [10, 'G'], [12, 'C'],
    [16, 'C'], [20, 'Am'], [24, 'C'], [26, 'G'], [28, 'C'],
    [32, 'C'], [36, 'Am'], [40, 'F'], [42, 'G'], [44, 'C'],
    [48, 'C'], [52, 'Am'], [56, 'C'], [58, 'G'], [60, 'C'],
  ],
};

/** Go Tell Aunt Rhody — American folk song (melody 18th c.). */
const rhody: Step[] = [
  [E, 2], [E, 1], [D, 1],   [C, 2], [C, 2],   [D, 2], [D, 1], [F, 1],   [E, 2], [D, 2],
  [G, 2], [G, 1], [F, 1],   [E, 2], [E, 2],   [D, 1], [C, 1], [D, 1], [E, 1],   [C, 4],
];
export const AUNT_RHODY: PublicDomainTune = {
  title: 'Go Tell Aunt Rhody',
  credit: 'American folk song (18th c. melody) · public domain',
  lanes: [C, D, E, F, G],
  steps: [...rhody, ...rhody],
  chords: [
    [0, 'C'], [4, 'Am'], [8, 'G7'], [12, 'C'], [14, 'G'], [16, 'C'], [20, 'Am'], [24, 'G7'], [28, 'C'],
    [32, 'C'], [36, 'F'], [40, 'G7'], [44, 'C'], [46, 'G'], [48, 'C'], [52, 'Am'], [56, 'G7'], [60, 'C'],
  ],
};

/** London Bridge Is Falling Down — English nursery rhyme (17th c.). Six keys C–A. */
const london: Step[] = [
  [G, 1.5], [A, 0.5], [G, 1], [F, 1],   [E, 1], [F, 1], [G, 2],   [D, 1], [E, 1], [F, 2],   [E, 1], [F, 1], [G, 2],
  [G, 1.5], [A, 0.5], [G, 1], [F, 1],   [E, 1], [F, 1], [G, 2],   [D, 2], [G, 2],           [E, 1], [C, 3],
];
export const LONDON_BRIDGE: PublicDomainTune = {
  title: 'London Bridge',
  credit: 'English nursery rhyme (17th c.) · public domain',
  lanes: [C, D, E, F, G, A],
  steps: [...london, ...london],
  chords: [[0, 'C'], [8, 'G7'], [12, 'C'], [24, 'G'], [28, 'C'], [32, 'C'], [40, 'G7'], [44, 'C'], [56, 'G'], [60, 'C']],
};

// ---------------------------------------------------------------------------
// Melody Mountain (World 3): wider range, jumps and black keys.

const B4 = 71;
const C5 = 72;
const D5 = 74;
const E5 = 76;
const F5 = 77;
const Fs4 = 66;
const Gs4 = 68;
const Ds5 = 75;
const A4 = 69;
const E4 = 64;

/** Joy to the World — Lowell Mason after Handel (1839). A full octave scale, C5 down to C4. */
export const JOY_TO_THE_WORLD: PublicDomainTune = {
  title: 'Joy to the World',
  credit: 'Lowell Mason (1839) · public domain',
  lanes: [C, D, E, F, G, A, B4, C5],
  steps: [
    [C5, 2], [B4, 1.5], [A, 0.5],   [G, 3], [F, 1],   [E, 2], [D, 2],   [C, 3], [G, 1],
    [A, 3], [A, 1],   [B4, 3], [B4, 1],   [C5, 3], [C5, 1],   [C5, 1], [B4, 1], [A, 1], [G, 1],
    [G, 1.5], [F, 0.5], [E, 1], [C5, 1],   [C5, 1], [B4, 1], [A, 1], [G, 1],   [G, 1.5], [F, 0.5], [E, 1], [E, 1],
    [E, 1], [E, 1], [E, 1], [E, 0.5], [F, 0.5],   [G, 3], [F, 0.5], [E, 0.5],
    [D, 1], [D, 1], [D, 1], [D, 0.5], [E, 0.5],   [F, 3], [E, 0.5], [D, 0.5],
    [C, 1], [C5, 2], [A, 1],   [G, 1.5], [F, 0.5], [E, 1], [F, 1],   [E, 2], [D, 2],   [C, 4],
  ],
  chords: [
    [0, 'C'], [2, 'G'], [4, 'C'], [10, 'G'], [12, 'C'], [16, 'F'], [20, 'G'], [24, 'C'], [30, 'F'],
    [32, 'C'], [38, 'F'], [40, 'C'], [52, 'G'], [56, 'G7'], [60, 'C'], [62, 'F'], [64, 'C'], [70, 'G'], [72, 'C'],
  ],
};

/** Brahms' Lullaby (Wiegenlied, Op. 49 No. 4) — Johannes Brahms (1868). 3/4. */
export const BRAHMS_LULLABY: PublicDomainTune = {
  title: "Brahms' Lullaby",
  credit: 'Johannes Brahms (1868) · public domain',
  lanes: [C, D, E, F, G, A, B4, C5],
  steps: [
    [R, 2], [E, 0.5], [E, 0.5],
    [G, 2], [E, 0.5], [E, 0.5],   [G, 2], [E, 0.5], [G, 0.5],   [C5, 1], [B4, 1.5], [A, 0.5],   [A, 1], [G, 1], [D, 0.5], [E, 0.5],
    [F, 1], [D, 1], [D, 0.5], [E, 0.5],   [F, 2], [D, 0.5], [F, 0.5],   [B4, 0.5], [A, 0.5], [G, 1], [B4, 1],   [C5, 2], [C, 0.5], [C, 0.5],
    [C5, 2], [A, 0.5], [F, 0.5],   [G, 2], [E, 0.5], [C, 0.5],   [F, 1], [G, 1], [A, 1],   [G, 2], [C, 0.5], [C, 0.5],
    [C5, 2], [A, 0.5], [F, 0.5],   [G, 2], [E, 0.5], [C, 0.5],   [F, 1], [E, 1], [D, 1],   [C, 3],
  ],
  chords: [[0, 'C'], [9, 'C'], [12, 'Dm'], [15, 'G7'], [24, 'C'], [27, 'F'], [30, 'C'], [33, 'Dm'], [36, 'C'], [39, 'F'], [42, 'C'], [45, 'G7'], [48, 'C']],
};

/** Amazing Grace ("New Britain") — American hymn tune (1829). In F, 3/4: big leaps. */
export const AMAZING_GRACE: PublicDomainTune = {
  title: 'Amazing Grace',
  credit: 'American hymn tune "New Britain" (1829) · public domain',
  lanes: [C, D, F, G, A, C5],
  steps: [
    [R, 2], [C, 1],
    [F, 2], [A, 0.5], [F, 0.5],   [A, 2], [G, 1],   [F, 2], [D, 1],   [C, 2], [C, 1],
    [F, 2], [A, 0.5], [F, 0.5],   [A, 2], [G, 1],   [C5, 3],
    [C5, 2], [A, 0.5], [C5, 0.5],   [A, 2], [F, 1],   [C, 2], [D, 1],   [F, 0.5], [D, 0.5], [C, 1], [C, 1],
    [F, 2], [A, 0.5], [F, 0.5],   [A, 2], [G, 1],   [F, 3],
  ],
  chords: [[0, 'F'], [9, 'Bb'], [12, 'C'], [15, 'F'], [21, 'C'], [24, 'F'], [27, 'Dm'], [30, 'C'], [33, 'Bb'], [36, 'F'], [42, 'F']],
};

/** Greensleeves — English ballad (16th c.). A minor, 3/4, with G# and F#. */
export const GREENSLEEVES: PublicDomainTune = {
  title: 'Greensleeves',
  credit: 'English ballad (16th c.) · public domain',
  lanes: [E4, Fs4, G, Gs4, A4, B4, C5, D5, E5, F5],
  steps: [
    [R, 2], [A4, 1],
    [C5, 2], [D5, 1],   [E5, 1.5], [F5, 0.5], [E5, 1],   [D5, 2], [B4, 1],   [G, 1.5], [A4, 0.5], [B4, 1],
    [C5, 2], [A4, 1],   [A4, 1.5], [Gs4, 0.5], [A4, 1],   [B4, 2], [Gs4, 1],   [E4, 2], [A4, 1],
    [C5, 2], [D5, 1],   [E5, 1.5], [F5, 0.5], [E5, 1],   [D5, 2], [B4, 1],   [G, 1.5], [A4, 0.5], [B4, 1],
    [C5, 1.5], [B4, 0.5], [A4, 1],   [Gs4, 1.5], [Fs4, 0.5], [Gs4, 1],   [A4, 3],
  ],
  chords: [
    [0, 'Am'], [3, 'Am'], [6, 'C'], [9, 'G'], [12, 'G'], [15, 'Am'], [18, 'Am'], [21, 'E'], [24, 'E'],
    [27, 'Am'], [30, 'C'], [33, 'G'], [36, 'G'], [39, 'Am'], [42, 'E'], [45, 'Am'],
  ],
};

/** Für Elise (WoO 59), opening theme, right hand — Ludwig van Beethoven (1810). 3/4, D# and G#. */
const eliseTurn: Step[] = [[E5, 0.5], [Ds5, 0.5], [E5, 0.5], [B4, 0.5], [D5, 0.5], [C5, 0.5]];
const eliseBody: Step[] = [
  ...eliseTurn,
  [A4, 1], [R, 0.5], [C, 0.5], [E4, 0.5], [A4, 0.5],
  [B4, 1], [R, 0.5], [E4, 0.5], [Gs4, 0.5], [B4, 0.5],
  [C5, 1], [R, 0.5], [E4, 0.5], [E5, 0.5], [Ds5, 0.5],
  ...eliseTurn,
  [A4, 1], [R, 0.5], [C, 0.5], [E4, 0.5], [A4, 0.5],
  [B4, 1], [R, 0.5], [E4, 0.5], [C5, 0.5], [B4, 0.5],
];
const eliseBarChords = ['Am', 'Am', 'E', 'Am', 'Am', 'Am', 'E'];
export const FUR_ELISE: PublicDomainTune = {
  title: 'Für Elise',
  credit: 'Ludwig van Beethoven (1810) · public domain',
  lanes: [C, E4, Gs4, A4, B4, C5, D5, Ds5, E5],
  steps: [
    [R, 2], [E5, 0.5], [Ds5, 0.5],
    ...eliseBody,
    [A4, 1], [R, 1], [E5, 0.5], [Ds5, 0.5],
    ...eliseBody,
    [A4, 3],
  ],
  chords: [
    [0, 'Am'],
    ...eliseBarChords.map((c, i) => [3 + i * 3, c] as [number, string]),
    [24, 'Am'],
    ...eliseBarChords.map((c, i) => [27 + i * 3, c] as [number, string]),
    [48, 'Am'],
  ],
};
