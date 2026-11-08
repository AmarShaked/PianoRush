/** Small, defensive localStorage wrapper (private mode / blocked storage must never break the game). */

export type TimingPreset = 'relaxed' | 'standard' | 'strict';

export interface Settings {
  keyboardSimulator: boolean;
  showKeyHints: boolean;
  reducedMotion: boolean;
  timingPreset: TimingPreset;
  /** Positive = your input arrives late; subtracted from input timestamps. */
  inputOffsetMs: number;
  lastMidiDeviceId: string | null;
}

const KEY = 'piano-rush:v1';

interface Stored {
  settings?: Partial<Settings>;
  bestScores?: Record<string, number>;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export const DEFAULT_SETTINGS: Settings = {
  keyboardSimulator: true,
  showKeyHints: true,
  reducedMotion: false,
  timingPreset: 'standard',
  inputOffsetMs: 0,
  lastMidiDeviceId: null,
};

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    return {};
  }
}

function write(data: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable: settings just won't persist */
  }
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, reducedMotion: prefersReducedMotion(), ...read().settings };
}

export function saveSettings(settings: Settings): void {
  write({ ...read(), settings });
}

export function getBestScore(songId: string): number {
  return read().bestScores?.[songId] ?? 0;
}

/** Records the score if it is a new best; returns the previous best. */
export function recordScore(songId: string, score: number): number {
  const data = read();
  const previous = data.bestScores?.[songId] ?? 0;
  if (score > previous) write({ ...data, bestScores: { ...data.bestScores, [songId]: score } });
  return previous;
}

export const TIMING_PRESETS: Record<TimingPreset, { label: string; windows: { perfect: number; great: number; good: number } }> = {
  relaxed: { label: 'Relaxed', windows: { perfect: 80, great: 170, good: 280 } },
  standard: { label: 'Standard', windows: { perfect: 60, great: 130, good: 220 } },
  strict: { label: 'Strict', windows: { perfect: 40, great: 90, good: 150 } },
};
