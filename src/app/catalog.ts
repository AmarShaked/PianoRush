import { compileSong, type CompiledSong } from '../song-content/compile';
import type { LevelDefinition } from '../song-content/level';
import { WORLD_1 } from '../song-content/levels/world1';

/** The content catalog. M2 ships World 1; further worlds append here. */
export const WORLDS = [WORLD_1] as const;
export const LEVELS: readonly LevelDefinition[] = WORLDS.flatMap((w) => w.levels);

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
