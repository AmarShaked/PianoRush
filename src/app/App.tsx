import { useCallback, useEffect, useState } from 'react';
import type { GameResults } from '../game-engine/GameEngine';
import {
  applyRun,
  evaluateRun,
  nextLevelToPlay,
  type ProgressMap,
  type ProgressUpdate,
  type RunOutcome,
} from '../game-engine/progression';
import type { GameMode, LevelDefinition } from '../song-content/level';
import type { PianoInputSource } from '../piano-input/types';
import { COLLECTIONS, collectionOf, isPlayable, LEVELS, nextInOrder, songFor } from './catalog';
import { audioEngine, keyboardSimulator, microphoneInput, midiManager } from './inputs';
import { useMic } from './useMic';
import { loadProgress, loadSettings, saveProgress, saveSettings, type Settings } from './storage';
import { useMidi } from './useMidi';
import { HomeScreen } from './screens/HomeScreen';
import { GameScreen } from './screens/GameScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';
import { CalibrationScreen } from './screens/CalibrationScreen';
import { SetupScreen, type SetupStep } from './screens/SetupScreen';

const INPUTS: readonly PianoInputSource[] = [midiManager, keyboardSimulator, microphoneInput];
const FIRST_LEVEL = LEVELS[0]!;

type Screen =
  | { readonly name: 'home' }
  | {
      readonly name: 'game';
      readonly run: number;
      readonly level: LevelDefinition;
      readonly mode: GameMode;
      readonly speed: number;
      readonly settings: Settings;
      readonly virtualPiano: boolean;
    }
  | {
      readonly name: 'results';
      readonly level: LevelDefinition;
      readonly mode: GameMode;
      readonly speed: number;
      readonly results: GameResults;
      readonly outcome: RunOutcome;
      readonly update: ProgressUpdate;
    }
  | { readonly name: 'diagnostics' }
  | { readonly name: 'calibration'; readonly returnTo: 'home' | 'setup' }
  | { readonly name: 'setup'; readonly step: SetupStep };

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [progress, setProgress] = useState<ProgressMap>(loadProgress);
  // Returning players continue where they left off.
  const [selected, setSelected] = useState<LevelDefinition>(() => nextLevelToPlay(LEVELS, loadProgress()) ?? FIRST_LEVEL);
  // First launch opens the setup guide (PRD §10); returning players go straight to level select.
  const [screen, setScreen] = useState<Screen>(() => (loadSettings().onboarded ? { name: 'home' } : { name: 'setup', step: 'welcome' }));
  const [run, setRun] = useState(0);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const midi = useMidi(midiManager, settings.lastMidiDeviceId);
  const mic = useMic();

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
    (level: LevelDefinition, mode: GameMode, speed: number = settings.practiceSpeed) => {
      // Always called from a click: the moment browsers allow audio to start.
      audioEngine.unlock();
      // Auto: built-in piano only when nothing else makes sound (never on top of an acoustic piano).
      const virtualPiano =
        settings.pianoOutput === 'virtual' ||
        (settings.pianoOutput === 'auto' && !midiManager.isListening && microphoneInput.status !== 'listening');
      setSelected(level);
      setRun((r) => r + 1);
      // Settings are frozen for the duration of a run.
      setScreen({ name: 'game', run: run + 1, level, mode, speed, settings, virtualPiano });
    },
    [run, settings],
  );

  const finish = useCallback(
    (level: LevelDefinition, mode: GameMode, speed: number, results: GameResults) => {
      const outcome = evaluateRun(level, results, mode, speed);
      // Free-play songs never unlock anything: merge them as a list of one.
      const list = collectionOf(level).kind === 'path' ? LEVELS : [level];
      const update = applyRun(list, progress, level.id, outcome, results.score);
      setProgress(update.progress);
      saveProgress(update.progress);
      setScreen({ name: 'results', level, mode, speed, results, outcome, update });
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
          song={songFor(screen.level, screen.speed)}
          mode={screen.mode}
          speed={screen.speed}
          inputs={INPUTS}
          settings={screen.settings}
          virtualPiano={screen.virtualPiano}
          onFinished={(results) => finish(screen.level, screen.mode, screen.speed, results)}
          onQuit={toHome}
        />
      );
    case 'results': {
      const next = nextInOrder(screen.level);
      const nextLevel = next && isPlayable(next, progress) ? next : null;
      return (
        <ResultsScreen
          level={screen.level}
          mode={screen.mode}
          results={screen.results}
          outcome={screen.outcome}
          update={screen.update}
          nextLevel={nextLevel}
          speed={screen.speed}
          onRetry={() => startLevel(screen.level, screen.mode, screen.speed)}
          onPlayMode={(m, sp) => {
            updateSettings({ preferredMode: m, practiceSpeed: sp });
            startLevel(screen.level, m, sp);
          }}
          onNext={() => nextLevel && startLevel(nextLevel, screen.mode === 'discover' ? 'flow' : screen.mode, 1)}
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
    case 'calibration':
      return (
        <CalibrationScreen
          inputs={INPUTS}
          keyboardSimulatorEnabled={settings.keyboardSimulator}
          currentOffsetMs={settings.inputOffsetMs}
          onApply={(offset) => {
            updateSettings({ inputOffsetMs: offset });
            setScreen(screen.returnTo === 'setup' ? { name: 'setup', step: 'ready' } : { name: 'home' });
          }}
          onBack={() => setScreen(screen.returnTo === 'setup' ? { name: 'setup', step: 'ready' } : { name: 'home' })}
        />
      );
    case 'setup':
      return (
        <SetupScreen
          mic={mic}
          key={screen.step}
          initialStep={screen.step}
          midi={midi}
          inputs={INPUTS}
          settings={settings}
          onSettingsChange={updateSettings}
          onCalibrate={() => setScreen({ name: 'calibration', returnTo: 'setup' })}
          onDone={(startFirst) => {
            updateSettings({ onboarded: true });
            if (startFirst) startLevel(FIRST_LEVEL, 'flow', 1);
            else toHome();
          }}
        />
      );
    default:
      return (
        <HomeScreen
          mic={mic}
          collections={COLLECTIONS}
          world={collectionOf(selected)}
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
          onCalibrate={() => setScreen({ name: 'calibration', returnTo: 'home' })}
          onSetup={() => setScreen({ name: 'setup', step: 'welcome' })}
        />
      );
  }
}
