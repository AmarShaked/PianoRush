import { describe, expect, it } from 'vitest';
import { applyRun, evaluateRun, isLevelUnlocked, nextLevelToPlay, totalStars, type ProgressMap } from './progression';
import type { GameResults } from './GameEngine';
import { WORLD_1 } from '../song-content';

const levels = WORLD_1.levels;
const L1 = levels[0]!;

function results(noteAccuracy: number, score = 1000): GameResults {
  return {
    songId: 'x', score, maxCombo: 0, counts: { perfect: 0, great: 0, good: 0, miss: 0 }, wrongNotes: 0,
    totalNotes: 10, totalEvents: 10, noteAccuracy, timingAccuracy: noteAccuracy, meanOffsetMs: null,
    holds: { total: 0, full: 0 }, partialChords: 0,
  };
}

describe('evaluateRun', () => {
  it.each([
    [0.49, false, 0],
    [0.5, true, 1],
    [0.79, true, 1],
    [0.8, true, 2],
    [0.949, true, 2],
    [0.95, true, 3],
    [1, true, 3],
  ] as const)('note accuracy %d → completed %s, %i stars', (acc, completed, stars) => {
    expect(evaluateRun(L1, results(acc), 'flow')).toMatchObject({ completed, stars, ranked: true });
  });

  it('Discover is practice: no stars and no unlock', () => {
    expect(evaluateRun(L1, results(1), 'discover')).toEqual({ mode: 'discover', completed: false, stars: 0, ranked: false });
  });
});

describe('progress and unlocks', () => {
  it('only level 1 is open at first', () => {
    expect(levels.map((_, i) => isLevelUnlocked(levels, i, {}))).toEqual([true, ...Array(9).fill(false)]);
    expect(nextLevelToPlay(levels, {})?.id).toBe(L1.id);
  });

  it('completing a level unlocks the next one without needing a perfect run', () => {
    const update = applyRun(levels, {}, L1.id, evaluateRun(L1, results(0.6, 1200), 'flow'), 1200);
    expect(update.current).toMatchObject({ completed: true, bestStars: 1, bestScore: 1200 });
    expect(update.unlockedNext).toBe(true);
    expect(update.newBestScore).toBe(true);
    expect(isLevelUnlocked(levels, 1, update.progress)).toBe(true);
    expect(nextLevelToPlay(levels, update.progress)?.id).toBe(levels[1]!.id);
  });

  it('a failed run does not unlock anything', () => {
    const update = applyRun(levels, {}, L1.id, evaluateRun(L1, results(0.3), 'flow'), 300);
    expect(update.current.completed).toBe(false);
    expect(update.unlockedNext).toBe(false);
  });

  it('never lowers best stars or score, and records Challenge clears', () => {
    let p: ProgressMap = {};
    p = applyRun(levels, p, L1.id, evaluateRun(L1, results(0.97, 5000), 'flow'), 5000).progress;
    const u = applyRun(levels, p, L1.id, evaluateRun(L1, results(0.6, 2000), 'challenge'), 2000);
    expect(u.current).toMatchObject({ bestStars: 3, bestScore: 5000, challengeCleared: true, completed: true });
    expect(u.newBestScore).toBe(false);
    expect(u.unlockedNext).toBe(false); // already unlocked
    expect(totalStars(levels, u.progress)).toBe(3);
  });

  it('Discover runs only mark the level as practised', () => {
    const u = applyRun(levels, {}, L1.id, evaluateRun(L1, results(1, 9000), 'discover'), 9000);
    expect(u.current).toMatchObject({ completed: false, bestScore: 0, discoverPlayed: true });
    expect(u.newBestScore).toBe(false);
  });

  it('after everything is completed, continue points at the last level', () => {
    const all: ProgressMap = Object.fromEntries(
      levels.map((l) => [l.id, { completed: true, bestStars: 3, bestScore: 1, challengeCleared: false, discoverPlayed: false }]),
    );
    expect(nextLevelToPlay(levels, all)?.id).toBe(levels[9]!.id);
  });
});
