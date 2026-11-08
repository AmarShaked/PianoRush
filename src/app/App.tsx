import { useCallback, useEffect, useState } from 'react';
import type { GameResults } from '../game-engine/GameEngine';
import {
  applyRun,
  evaluateRun,
  isLevelUnlocked,
  nextLevelToPlay,
  type ProgressMap,
  type ProgressUpdate,
  type RunOutcome,
} from '../game-engine/progression';
import type { GameMode, LevelDefinition } from '../song-content/level';
import type { PianoInputSource } from '../piano-input/types';
import { LEVELS, songFor, WORLDS } from './catalog';
import { keyboardSimulator, midiManager } from './inputs';
import { loadProgress, loadSettings, saveProgress, saveSettings, type Settings } from './storage';
import { useMidi } from './useMidi';
import { HomeScreen } from './screens/HomeScreen';
import { GameScreen } from './screens/GameScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';

const INPUTS: readonly PianoInputSource[] = [midiManager, keyboardSimulator];
const FIRST_LEVEL = LEVELS[0]!;

type Screen =
  | { readonly name: 'home' }
  | { readonly name: 'game'; readonly run: number; readonly level: LevelDefinition; readonly mode: GameMode; readonly settings: Settings }
  | {
      readonly name: 'results';
      readonly level: LevelDefinition;
      readonly mode: GameMode;
      readonly results: GameResults;
      readonly outcome: RunOutcome;
      readonly update: ProgressUpdate;
    }
  | { readonly name: 'diagnostics' };

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [progress, setProgress] = useState<ProgressMap>(loadProgress);
  // Returning players continue where they left off.
  const [selected, setSelected] = useState<LevelDefinition>(() => nextLevelToPlay(LEVELS, loadProgress()) ?? FIRST_LEVEL);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [run, setRun] = useState(0);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const midi = useMidi(midiManager, settings.lastMidiDeviceId);

  // Remember the chosen device so returning players reconnect automatically.
  useEffect(() => {
    if (midi.selectedId && midi.selectedId !== settings.lastMidiDeviceId) updateSettings({ lastMidiDeviceId: midi.selectedId });
  }, [midi.selectedId, settings.lastMidiDeviceId, updateSettings]);

  // The keyboard simulator only listens while a level is on screen.
  const gameSimEnabled = screen.name === 'game' && screen.settings.keyboardSimulator;
  useEffect(() => {
    if (!gameSimEnabled) return;
    keyboardSimulator.enable();
    return () => keyboardSimulator.disable();
  }, [gameSimEnabled]);

  const startLevel = useCallback(
    (level: LevelDefinition, mode: GameMode) => {
      setSelected(level);
      setRun((r) => r + 1);
      // Settings are frozen for the duration of a run.
      setScreen({ name: 'game', run: run + 1, level, mode, settings });
    },
    [run, settings],
  );

  const finish = useCallback(
    (level: LevelDefinition, mode: GameMode, results: GameResults) => {
      const outcome = evaluateRun(level, results, mode);
      const update = applyRun(LEVELS, progress, level.id, outcome, results.score);
      setProgress(update.progress);
      saveProgress(update.progress);
      setScreen({ name: 'results', level, mode, results, outcome, update });
    },
    [progress],
  );

  const toHome = useCallback(() => setScreen({ name: 'home' }), []);
  const mode = settings.preferredMode;

  switch (screen.name) {
    case 'game':
      return (
        <GameScreen
          key={screen.run}
          level={screen.level}
          song={songFor(screen.level)}
          mode={screen.mode}
          inputs={INPUTS}
          settings={screen.settings}
          onFinished={(results) => finish(screen.level, screen.mode, results)}
          onQuit={toHome}
        />
      );
    case 'results': {
      const index = LEVELS.indexOf(screen.level);
      const next = LEVELS[index + 1];
      const nextLevel = next && isLevelUnlocked(LEVELS, index + 1, progress) ? next : null;
      return (
        <ResultsScreen
          level={screen.level}
          mode={screen.mode}
          results={screen.results}
          outcome={screen.outcome}
          update={screen.update}
          nextLevel={nextLevel}
          onRetry={() => startLevel(screen.level, screen.mode)}
          onPlayMode={(m) => {
            updateSettings({ preferredMode: m });
            startLevel(screen.level, m);
          }}
          onNext={() => nextLevel && startLevel(nextLevel, screen.mode === 'discover' ? 'flow' : screen.mode)}
          onMenu={() => {
            if (screen.update.unlockedNext && nextLevel) setSelected(nextLevel);
            toHome();
          }}
        />
      );
    }
    case 'diagnostics':
      return (
        <DiagnosticsScreen
          midi={midi}
          keyboardSimulatorEnabled={settings.keyboardSimulator}
          onKeyboardSimulatorChange={(v) => updateSettings({ keyboardSimulator: v })}
          lanes={[60, 62, 64, 65, 67]}
          onBack={toHome}
        />
      );
    default:
      return (
        <HomeScreen
          world={WORLDS[0]}
          progress={progress}
          selected={selected}
          onSelect={setSelected}
          mode={mode}
          onModeChange={(m) => updateSettings({ preferredMode: m })}
          midi={midi}
          settings={settings}
          onSettingsChange={updateSettings}
          onPlay={() => startLevel(selected, mode)}
          onDiagnostics={() => setScreen({ name: 'diagnostics' })}
        />
      );
  }
}
