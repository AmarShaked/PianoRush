import { compileSong, type CompiledSong } from '../song-content/compile';
import type { LevelDefinition, WorldDefinition } from '../song-content/level';
import { HITS } from '../song-content/levels/hits';
import { WORLD_1 } from '../song-content/levels/world1';
import { WORLD_2 } from '../song-content/levels/world2';
import { WORLD_3 } from '../song-content/levels/world3';
import { isLevelUnlocked, type ProgressMap } from '../game-engine/progression';

/** Learning-path worlds (levels unlock in order). Further worlds append here. */
export const WORLDS: readonly WorldDefinition[] = [WORLD_1, WORLD_2, WORLD_3];
/** Everything selectable on the home screen: the path worlds plus free-play lists. */
export const COLLECTIONS: readonly WorldDefinition[] = [...WORLDS, HITS];
/** The learning path's levels, in order. */
export const LEVELS: readonly LevelDefinition[] = WORLDS.flatMap((w) => w.levels);

export function collectionOf(level: LevelDefinition): WorldDefinition {
  return COLLECTIONS.find((c) => c.levels.includes(level)) ?? WORLD_1;
}

/**
 * Whether a level can be played. Path levels unlock in one continuous order
 * across worlds (World 2 level 1 opens when World 1's finale is completed);
 * free-play songs are always open.
 */
export function isPlayable(level: LevelDefinition, progress: ProgressMap): boolean {
  if (collectionOf(level).kind === 'freeplay') return true;
  return isLevelUnlocked(LEVELS, LEVELS.indexOf(level), progress);
}

/** The entry after `level` in its collection's play order (path order crosses worlds). */
export function nextInOrder(level: LevelDefinition): LevelDefinition | undefined {
  const c = collectionOf(level);
  const list = c.kind === 'path' ? LEVELS : c.levels;
  return list[list.indexOf(level) + 1];
}

const compiled = new Map<string, CompiledSong>();

/**
 * Validated, compiled song for a level (compiled once per speed, cached).
 * Practice speed scales the tempo; beats, lanes and the arrangement are
 * unchanged, so tiles, judging and the backing all slow down together.
 */
export function songFor(level: LevelDefinition, speed = 1): CompiledSong {
  const key = `${level.id}@${speed}`;
  let song = compiled.get(key);
  if (!song) {
    song = compileSong(speed === 1 ? level.song : { ...level.song, bpm: level.song.bpm * speed });
    compiled.set(key, song);
  }
  return song;
}
