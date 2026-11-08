import { compileSong, type CompiledSong } from '../song-content/compile';
import type { LevelDefinition, WorldDefinition } from '../song-content/level';
import { HITS } from '../song-content/levels/hits';
import { WORLD_1 } from '../song-content/levels/world1';

/** Learning-path worlds (levels unlock in order). Further worlds append here. */
export const WORLDS: readonly WorldDefinition[] = [WORLD_1];
/** Everything selectable on the home screen: the path worlds plus free-play lists. */
export const COLLECTIONS: readonly WorldDefinition[] = [...WORLDS, HITS];
/** The learning path's levels, in order. */
export const LEVELS: readonly LevelDefinition[] = WORLDS.flatMap((w) => w.levels);

export function collectionOf(level: LevelDefinition): WorldDefinition {
  return COLLECTIONS.find((c) => c.levels.includes(level)) ?? WORLD_1;
}

const compiled = new Map<string, CompiledSong>();

/** Validated, compiled song for a level (compiled once, cached). */
export function songFor(level: LevelDefinition): CompiledSong {
  let song = compiled.get(level.id);
  if (!song) {
    song = compileSong(level.song);
    compiled.set(level.id, song);
  }
  return song;
}
