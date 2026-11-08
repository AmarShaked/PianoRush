/**
 * Versioned, beat-based song definition format.
 *
 * Musical time is expressed in beats (quarter notes for x/4 meters). The game
 * converts beats to milliseconds using the BPM at load time; nothing in the
 * song data is stored in absolute time.
 */

export const SONG_SCHEMA_VERSION = 1;

export type Hand = 'right' | 'left';

export interface SongNote {
  /** MIDI pitch. Must be one of the song's lane pitches. */
  readonly midi: number;
  /** Start position in beats from the beginning of bar 1 (0-based). */
  readonly startBeat: number;
  /** Length in beats. */
  readonly durationBeats: number;
  readonly hand?: Hand;
  /** Force (true) or suppress (false) hold-tile behaviour; default from `holdMinBeats`. */
  readonly hold?: boolean;
}

/** Visual-assistance options (learning aids). */
export interface SongAssist {
  /**
   * Beat ranges [fromBeat, toBeat) whose tiles fade out before reaching the hit
   * line, so the player has to play them from memory.
   */
  readonly fadeRanges?: readonly (readonly [number, number])[];
}

export interface SongDefinition {
  readonly schemaVersion: typeof SONG_SCHEMA_VERSION;
  readonly id: string;
  readonly title: string;
  readonly composer: string;
  readonly bpm: number;
  /** [beats per bar, beat unit] e.g. [4, 4]. */
  readonly timeSignature: readonly [number, number];
  /** Count-in length before beat 0, in beats. */
  readonly countInBeats: number;
  /**
   * Fixed lane → MIDI pitch mapping, left to right. Constant for the whole
   * level.
   */
  readonly lanes: readonly number[];
  readonly notes: readonly SongNote[];
  /** Notes at least this long (beats) are hold tiles whose release is scored. Default 1.5. */
  readonly holdMinBeats?: number;
  readonly assist?: SongAssist;
  /** Free-form difficulty metadata for the future learning system. */
  readonly difficulty?: { readonly level: number; readonly skills: readonly string[] };
  /** Reserved for M3: backing-track asset references. */
  readonly backing?: { readonly audioUrl: string; readonly offsetBeats?: number };
}
