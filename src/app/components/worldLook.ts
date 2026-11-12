import type { CSSProperties } from 'react';
import type { WorldDefinition } from '../../song-content/level';

export interface WorldLook {
  readonly emoji: string;
  /** Main colour (CSS). */
  readonly color: string;
  /** Darker shade for the chunky button edge. */
  readonly shade: string;
}

const PATH_LOOKS: readonly WorldLook[] = [
  { emoji: '👆', color: '#ff5d8f', shade: '#c93a6a' },
  { emoji: '🥁', color: '#ff9f1c', shade: '#c47406' },
  { emoji: '⛰️', color: '#2fcf7a', shade: '#1c9a57' },
  { emoji: '🖐️', color: '#2ab7f0', shade: '#1584b3' },
  { emoji: '🏙️', color: '#7b6cff', shade: '#5244d1' },
  { emoji: '🎉', color: '#c86bfa', shade: '#9440c4' },
];

const HITS_LOOK: WorldLook = { emoji: '🔥', color: '#ff6b3d', shade: '#c84719' };
const PACK_LOOK: WorldLook = { emoji: '🎬', color: '#f5b82e', shade: '#b8860f' };
const MY_SONGS_LOOK: WorldLook = { emoji: '🎵', color: '#2ec4b6', shade: '#1a8f84' };

/** Each collection's emoji and colour on the menus. */
export function worldLook(world: WorldDefinition): WorldLook {
  if (world.id === -1) return MY_SONGS_LOOK;
  if (world.kind === 'path') return PATH_LOOKS[(world.id - 1) % PATH_LOOKS.length] ?? PATH_LOOKS[0]!;
  return world.id >= 100 ? PACK_LOOK : HITS_LOOK;
}

/** CSS custom properties that colour a component in a world's look. */
export const lookStyle = (look: WorldLook) => ({ '--world': look.color, '--world-shade': look.shade }) as CSSProperties;
