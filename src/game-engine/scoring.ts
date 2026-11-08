import type { HitJudgment, Judgment, ScoringConfig } from './config';

/** Multiplier applied to a hit, based on the combo *before* that hit. Capped. */
export function comboMultiplier(comboBefore: number, scoring: ScoringConfig): number {
  const steps = Math.floor(Math.max(0, comboBefore) / scoring.comboStep);
  return Math.min(1 + steps * scoring.bonusPerStep, scoring.maxMultiplier);
}

export function pointsFor(judgment: HitJudgment, comboBefore: number, scoring: ScoringConfig): number {
  return Math.round(scoring.points[judgment] * comboMultiplier(comboBefore, scoring));
}

export interface JudgmentCounts {
  perfect: number;
  great: number;
  good: number;
  miss: number;
}

export function emptyCounts(): JudgmentCounts {
  return { perfect: 0, great: 0, good: 0, miss: 0 };
}

const TIMING_WEIGHT: Record<Judgment, number> = { perfect: 1, great: 0.75, good: 0.4, miss: 0 };

/** Fraction of notes hit at all (pitch + within Good window). */
export function noteAccuracy(c: JudgmentCounts): number {
  const total = c.perfect + c.great + c.good + c.miss;
  return total === 0 ? 0 : (c.perfect + c.great + c.good) / total;
}

/** Timing quality weighted by judgment (Perfect = 100%, Miss = 0%). */
export function timingAccuracy(c: JudgmentCounts): number {
  const total = c.perfect + c.great + c.good + c.miss;
  if (total === 0) return 0;
  return (
    (c.perfect * TIMING_WEIGHT.perfect + c.great * TIMING_WEIGHT.great + c.good * TIMING_WEIGHT.good) / total
  );
}

/** PRD star rule: 1 = completed, 2 = ≥80 % note accuracy, 3 = ≥95 %. */
export function starsFor(noteAcc: number): 1 | 2 | 3 {
  if (noteAcc >= 0.95) return 3;
  if (noteAcc >= 0.8) return 2;
  return 1;
}
