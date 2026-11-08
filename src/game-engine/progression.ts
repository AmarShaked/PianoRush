import type { GameMode, LevelDefinition } from '../song-content/level';
import type { GameResults } from './GameEngine';

export type StarCount = 0 | 1 | 2 | 3;

export interface RunOutcome {
  readonly mode: GameMode;
  /** Playback speed factor (1 = full tempo). */
  readonly speed: number;
  /** Met the level's completion condition (unlocks the next level). */
  readonly completed: boolean;
  readonly stars: StarCount;
  /** Whether this run affects stars / unlocks (Discover is practice only). */
  readonly ranked: boolean;
}

/** Saved per-level progress. */
export interface LevelProgress {
  readonly completed: boolean;
  readonly bestStars: StarCount;
  /** Best score in a ranked mode (Flow or Challenge). */
  readonly bestScore: number;
  readonly challengeCleared: boolean;
  readonly discoverPlayed: boolean;
}

export type ProgressMap = Readonly<Record<string, LevelProgress>>;

export const EMPTY_PROGRESS: LevelProgress = {
  completed: false,
  bestStars: 0,
  bestScore: 0,
  challengeCleared: false,
  discoverPlayed: false,
};

type LevelRules = Pick<LevelDefinition, 'completion' | 'stars'>;

/**
 * PRD §7.3: one star for completing, two at ≥80 % note accuracy, three at ≥95 %
 * (thresholds come from the level). Discover runs and slowed-down runs are
 * practice: no stars, no unlock.
 */
export function evaluateRun(level: LevelRules, results: GameResults, mode: GameMode, speed = 1, practice = false): RunOutcome {
  if (mode === 'discover' || speed < 1 || practice) return { mode, speed, completed: false, stars: 0, ranked: false };
  const acc = results.noteAccuracy;
  const completed = acc >= level.completion.minNoteAccuracy;
  const stars: StarCount = !completed ? 0 : acc >= level.stars.three ? 3 : acc >= level.stars.two ? 2 : 1;
  return { mode, speed, completed, stars, ranked: true };
}

/** Practice speeds offered in the UI. */
export const PRACTICE_SPEEDS = [0.5, 0.75, 1] as const;

export interface ProgressUpdate {
  readonly progress: ProgressMap;
  readonly previous: LevelProgress;
  readonly current: LevelProgress;
  readonly newBestScore: boolean;
  /** Completing this run unlocked a level that was locked before. */
  readonly unlockedNext: boolean;
}

/** Merge a finished run into saved progress (never lowers a best). */
export function applyRun(
  levels: readonly LevelDefinition[],
  progress: ProgressMap,
  levelId: string,
  outcome: RunOutcome,
  score: number,
): ProgressUpdate {
  const previous = progress[levelId] ?? EMPTY_PROGRESS;
  const current: LevelProgress = outcome.ranked
    ? {
        completed: previous.completed || outcome.completed,
        bestStars: Math.max(previous.bestStars, outcome.stars) as StarCount,
        bestScore: Math.max(previous.bestScore, score),
        challengeCleared: previous.challengeCleared || (outcome.mode === 'challenge' && outcome.completed),
        discoverPlayed: previous.discoverPlayed,
      }
    : { ...previous, discoverPlayed: true };
  const next = { ...progress, [levelId]: current };
  const index = levels.findIndex((l) => l.id === levelId);
  const wasUnlocked = isLevelUnlocked(levels, index + 1, progress);
  return {
    progress: next,
    previous,
    current,
    newBestScore: outcome.ranked && score > previous.bestScore,
    unlockedNext: index + 1 < levels.length && !wasUnlocked && isLevelUnlocked(levels, index + 1, next),
  };
}

/** Level 1 is always open; every other level opens once the previous one is completed. */
export function isLevelUnlocked(levels: readonly LevelDefinition[], index: number, progress: ProgressMap): boolean {
  if (index <= 0) return index === 0;
  const prev = levels[index - 1];
  return prev !== undefined && (progress[prev.id]?.completed ?? false);
}

/** Where a returning player should continue: the first unlocked, not-yet-completed level. */
export function nextLevelToPlay(levels: readonly LevelDefinition[], progress: ProgressMap): LevelDefinition | undefined {
  return levels.find((l, i) => isLevelUnlocked(levels, i, progress) && !progress[l.id]?.completed) ?? levels[levels.length - 1];
}

export function totalStars(levels: readonly LevelDefinition[], progress: ProgressMap): number {
  return levels.reduce((sum, l) => sum + (progress[l.id]?.bestStars ?? 0), 0);
}
