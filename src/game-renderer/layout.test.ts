import { describe, expect, it } from 'vitest';
import { computeLayout, noteBottomY } from './layout';

describe('playfield layout', () => {
  const layout = computeLayout(1280, 720, { laneCount: 5, lookaheadMs: 1800, topInset: 64 });

  it('centres five equal lanes above a keyboard strip', () => {
    expect(layout.right - layout.left).toBeCloseTo(layout.laneWidth * 5);
    expect(layout.left).toBe(Math.round((1280 - layout.laneWidth * 5) / 2));
    expect(layout.hitY).toBeLessThan(layout.keysTop);
    expect(layout.keysTop + layout.keysHeight).toBe(720);
  });

  it('maps song time to position linearly: a note sits on the hit line at its time', () => {
    expect(noteBottomY(layout, 5000, 5000)).toBe(layout.hitY);
    expect(noteBottomY(layout, 5000 + 1800, 5000)).toBeCloseTo(64);
    expect(noteBottomY(layout, 5000, 5100)).toBeGreaterThan(layout.hitY);
  });

  it('keeps lanes usable on small landscape screens', () => {
    const small = computeLayout(667, 375, { laneCount: 5, lookaheadMs: 1800 });
    expect(small.laneWidth).toBeGreaterThanOrEqual(44);
    expect(small.left).toBeGreaterThanOrEqual(0);
  });
});
