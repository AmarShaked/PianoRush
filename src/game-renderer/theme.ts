import type { Judgment } from '../game-engine/config';

/** Lane colours (distinct hue AND every lane also carries a text label — colour is never the only cue). */
export const LANE_COLORS = [0xff4d6d, 0xffa62b, 0xffd93d, 0x3ddc97, 0x4cc9f0, 0x9d7bff, 0xff7bd5] as const;

export function laneColor(lane: number): number {
  return LANE_COLORS[lane % LANE_COLORS.length] ?? 0xffffff;
}

export const COLORS = {
  background: 0x0b0b18,
  laneA: 0x12122a,
  laneB: 0x15152f,
  separator: 0x2a2a4a,
  hitLine: 0xffffff,
  missed: 0x4a4a62,
  text: 0xf4f4ff,
  textDim: 0x9a9ac0,
  wrong: 0xff3355,
  keyWhite: 0xe9e9f4,
  keyShadow: 0x9a9ab8,
  keyBlack: 0x15151f,
} as const;

export const JUDGMENT_STYLE: Record<Judgment, { label: string; color: number }> = {
  perfect: { label: 'PERFECT', color: 0x7cf7ff },
  great: { label: 'GREAT', color: 0x8dff8a },
  good: { label: 'GOOD', color: 0xffd36e },
  miss: { label: 'MISS', color: 0xff5470 },
};

export const FONT_FAMILY = 'Inter, "Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif';

/** Mix a colour toward white (t>0) or black (t<0). */
export function shade(color: number, t: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const target = t >= 0 ? 255 : 0;
  const k = Math.abs(t);
  const mix = (c: number) => Math.round(c + (target - c) * k);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}
