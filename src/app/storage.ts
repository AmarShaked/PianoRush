/** Small, defensive localStorage wrapper (private mode / blocked storage must never break the game). */
import type { ProgressMap } from '../game-engine/progression';
import type { GameMode } from '../song-content/level';

export type TimingPreset = 'relaxed' | 'standard' | 'strict';

export interface Settings {
  keyboardSimulator: boolean;
  showKeyHints: boolean;
  reducedMotion: boolean;
  timingPreset: TimingPreset;
  /** Positive = your input arrives late; subtracted from input timestamps. */
  inputOffsetMs: number;
  lastMidiDeviceId: string | null;
  preferredMode: GameMode;
  /** Who makes the piano sound: your instrument, the built-in synth, or auto (built-in unless a MIDI piano is connected). */
  pianoOutput: PianoOutput;
  backingVolume: number;
  pianoVolume: number;
  metronomeVolume: number;
  /** Click on every beat during the song (the count-in always clicks). */
  metronome: boolean;
}

export type PianoOutput = 'auto' | 'physical' | 'virtual';

const KEY = 'piano-rush:v1';

interface Stored {
  settings?: Partial<Settings>;
  progress?: ProgressMap;
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
  preferredMode: 'flow',
  pianoOutput: 'auto',
  backingVolume: 0.8,
  pianoVolume: 0.9,
  metronomeVolume: 0.6,
  metronome: false,
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

export function loadProgress(): ProgressMap {
  return read().progress ?? {};
}

export function saveProgress(progress: ProgressMap): void {
  write({ ...read(), progress });
}

export const TIMING_PRESETS: Record<TimingPreset, { label: string; windows: { perfect: number; great: number; good: number } }> = {
  relaxed: { label: 'Relaxed', windows: { perfect: 80, great: 170, good: 280 } },
  standard: { label: 'Standard', windows: { perfect: 60, great: 130, good: 220 } },
  strict: { label: 'Strict', windows: { perfect: 40, great: 90, good: 150 } },
};

/** Challenge mode always uses strict windows, whatever the timing preference. */
export const CHALLENGE_WINDOWS = TIMING_PRESETS.strict.windows;
