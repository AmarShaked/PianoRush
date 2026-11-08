import type { Hand, SongDefinition } from './schema';

/** How a level is played. All modes use the same song data. */
export type GameMode = 'discover' | 'flow' | 'challenge';

export const GAME_MODES: readonly GameMode[] = ['discover', 'flow', 'challenge'];

/**
 * A level in the learning path (PRD §7.2): objective, range, hand, piece,
 * tempo (from the song), modes, completion condition and star thresholds.
 */
export interface LevelDefinition {
  readonly id: string;
  readonly world: number;
  /** 1-based position within the world. */
  readonly number: number;
  readonly title: string;
  /** The one new skill this level introduces. */
  readonly objective: string;
  readonly hand: Hand;
  readonly song: SongDefinition;
  readonly modes: readonly GameMode[];
  /** A run counts as "completed" (and unlocks the next level) at or above this note accuracy. */
  readonly completion: { readonly minNoteAccuracy: number };
  /** Note-accuracy thresholds for the 2nd and 3rd star (1 star = completed). */
  readonly stars: { readonly two: number; readonly three: number };
}

export interface WorldDefinition {
  readonly id: number;
  /** `path`: levels unlock in order. `freeplay`: every song is open from the start. */
  readonly kind: 'path' | 'freeplay';
  readonly title: string;
  readonly subtitle: string;
  readonly levels: readonly LevelDefinition[];
}
