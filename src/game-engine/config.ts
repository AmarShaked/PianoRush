export type Judgment = 'perfect' | 'great' | 'good' | 'miss';
export type HitJudgment = Exclude<Judgment, 'miss'>;

/** Maximum absolute timing error (ms, inclusive) for each judgment. */
export interface TimingWindows {
  readonly perfect: number;
  readonly great: number;
  readonly good: number;
}

export interface ScoringConfig {
  readonly points: Readonly<Record<Judgment, number>>;
  /** Combo multiplier grows by `bonusPerStep` every `comboStep` consecutive hits… */
  readonly comboStep: number;
  readonly bonusPerStep: number;
  /** …but never exceeds this cap. */
  readonly maxMultiplier: number;
}

export interface EngineConfig {
  readonly windows: TimingWindows;
  readonly scoring: ScoringConfig;
  /**
   * Extra time after a note's Good window closes before a frame update may
   * declare it missed. Absorbs input-delivery jitter so a slightly delayed
   * event can still be judged by its own (exact) timestamp. Does not change
   * judgments, only when the miss is declared.
   */
  readonly missGraceMs: number;
  /** Shift applied to input timestamps (positive = player/device is late). Calibration hook. */
  readonly inputOffsetMs: number;
  /** Repeated noteOn on a held key within this window is treated as a duplicate. */
  readonly duplicateWindowMs: number;
  /** Frozen "3-2-1" period after resuming from pause, in beats. */
  readonly resumeCountdownBeats: number;
  /** Silence after the final note ends before the level completes, in ms. */
  readonly endTailMs: number;
  /** Whether a wrong / extra keypress resets the combo. */
  readonly wrongNoteBreaksCombo: boolean;
}

export const DEFAULT_TIMING_WINDOWS: TimingWindows = { perfect: 60, great: 130, good: 220 };

export const DEFAULT_SCORING: ScoringConfig = {
  points: { perfect: 100, great: 75, good: 40, miss: 0 },
  comboStep: 10,
  bonusPerStep: 0.1,
  maxMultiplier: 1.5,
};

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  windows: DEFAULT_TIMING_WINDOWS,
  scoring: DEFAULT_SCORING,
  missGraceMs: 40,
  inputOffsetMs: 0,
  duplicateWindowMs: 30,
  resumeCountdownBeats: 3,
  endTailMs: 800,
  wrongNoteBreaksCombo: true,
};

export type EngineConfigInput = Partial<Omit<EngineConfig, 'windows' | 'scoring'>> & {
  windows?: Partial<TimingWindows>;
  scoring?: Partial<ScoringConfig>;
};

export function resolveConfig(input: EngineConfigInput = {}): EngineConfig {
  const windows = { ...DEFAULT_TIMING_WINDOWS, ...input.windows };
  if (!(windows.perfect >= 0 && windows.perfect <= windows.great && windows.great <= windows.good)) {
    throw new Error(`Timing windows must satisfy 0 <= perfect <= great <= good (got ${JSON.stringify(windows)})`);
  }
  return {
    ...DEFAULT_ENGINE_CONFIG,
    ...input,
    windows,
    scoring: { ...DEFAULT_SCORING, ...input.scoring },
  };
}

/** Classify an absolute timing error. Window edges are inclusive. */
export function judgeOffset(offsetMs: number, windows: TimingWindows): Judgment {
  const abs = Math.abs(offsetMs);
  if (abs <= windows.perfect) return 'perfect';
  if (abs <= windows.great) return 'great';
  if (abs <= windows.good) return 'good';
  return 'miss';
}
