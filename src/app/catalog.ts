import { compileSong, type CompiledSong } from '../song-content/compile';
import { sliceSong } from '../song-content/practice';
import type { LevelDefinition, WorldDefinition } from '../song-content/level';
import { HITS } from '../song-content/levels/hits';
import { WORLD_1 } from '../song-content/levels/world1';
import { WORLD_2 } from '../song-content/levels/world2';
import { WORLD_3 } from '../song-content/levels/world3';
import { WORLD_4 } from '../song-content/levels/world4';
import { WORLD_5 } from '../song-content/levels/world5';
import { WORLD_6 } from '../song-content/levels/world6';
import { isLevelUnlocked, type ProgressMap } from '../game-engine/progression';

/** Learning-path worlds (levels unlock in order). Further worlds append here. */
export const WORLDS: readonly WorldDefinition[] = [WORLD_1, WORLD_2, WORLD_3, WORLD_4, WORLD_5, WORLD_6];
/** Licensed packs bundled from content/licensed/*.json (git-ignored; present only in your own builds). */
interface LicensedPack {
  readonly title: string;
  readonly license?: { readonly holder: string; readonly reference: string; readonly territory?: string };
  readonly songs: readonly import('../song-content/schema').SongDefinition[];
}
const packFiles = import.meta.glob<LicensedPack>('../../content/licensed/*.json', { eager: true, import: 'default' });
export const LICENSED_PACKS: readonly WorldDefinition[] = Object.values(packFiles).map((pack, p) => ({
  id: 100 + p,
  kind: 'freeplay' as const,
  title: pack.title,
  subtitle: pack.license ? `Licensed · ${pack.license.holder} ${pack.license.reference}${pack.license.territory ? ` · ${pack.license.territory}` : ''}` : 'Licensed songs',
  levels: pack.songs.map((song, i) => ({
    id: `pack${p}-${song.id}`,
    world: 0,
    number: i + 1,
    title: song.title,
    objective: song.license ? `Licensed: ${song.license.holder} ${song.license.reference}` : 'Licensed song',
    hand: 'right' as const,
    song: { ...song, ...(pack.license && !song.license ? { license: pack.license } : {}) },
    modes: ['discover', 'flow', 'challenge'] as const,
    completion: { minNoteAccuracy: 0.5 },
    stars: { two: 0.8, three: 0.95 },
  })),
}));

/** Everything selectable on the home screen: the path worlds plus free-play lists. */
export const COLLECTIONS: readonly WorldDefinition[] = [...WORLDS, HITS, ...LICENSED_PACKS];

/** Imported songs ("My Songs") are registered at runtime. */
let userCollections: WorldDefinition[] = [];
export function setUserCollections(collections: WorldDefinition[]): void {
  userCollections = collections;
}
export function allCollections(): readonly WorldDefinition[] {
  return [...COLLECTIONS, ...userCollections];
}
/** The learning path's levels, in order. */
export const LEVELS: readonly LevelDefinition[] = WORLDS.flatMap((w) => w.levels);

export function collectionOf(level: LevelDefinition): WorldDefinition {
  return allCollections().find((c) => c.levels.includes(level)) ?? WORLD_1;
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

/** A looped practice section of a level (PRD §7.4). */
export interface PracticeSection {
  readonly fromBeat: number;
  readonly toBeat: number;
  readonly firstBar: number;
  readonly lastBar: number;
  readonly repeats: number;
}

export function sectionSongFor(level: LevelDefinition, section: PracticeSection, speed = 1): CompiledSong {
  const key = `${level.id}@${speed}#${section.fromBeat}-${section.toBeat}x${section.repeats}`;
  let song = compiled.get(key);
  if (!song) {
    const sliced = sliceSong(level.song, section.fromBeat, section.toBeat, section.repeats);
    song = compileSong(speed === 1 ? sliced : { ...sliced, bpm: sliced.bpm * speed });
    compiled.set(key, song);
  }
  return song;
}
