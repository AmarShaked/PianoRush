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
import { allCollections, collectionOf, isPlayable, LEVELS, nextInOrder, sectionSongFor, setUserCollections, songFor, type PracticeSection } from './catalog';
import { deleteMySong, listMySongs, mySongsCollection } from './library';
import { ImportScreen } from './screens/ImportScreen';
import { audioEngine, keyboardSimulator, microphoneInput, midiManager, nativeMidi } from './inputs';
import { useMic } from './useMic';
import { configKey, describeConfig, offsetFor } from './calibrationKeys';
import { loadProgress, loadSettings, saveProgress, saveSettings, type Settings } from './storage';
import { useMidi } from './useMidi';
import { HomeScreen } from './screens/HomeScreen';
import { GameScreen } from './screens/GameScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';
import { CalibrationScreen } from './screens/CalibrationScreen';
import { SetupScreen, type SetupStep } from './screens/SetupScreen';

const INPUTS: readonly PianoInputSource[] = [midiManager, keyboardSimulator, microphoneInput, nativeMidi];
const FIRST_LEVEL = LEVELS[0]!;

type Screen =
  | { readonly name: 'home' }
  | {
      readonly name: 'game';
      readonly run: number;
      readonly level: LevelDefinition;
      readonly mode: GameMode;
      readonly speed: number;
      readonly section: PracticeSection | null;
      readonly settings: Settings;
      readonly virtualPiano: boolean;
      /** Listen mode: the game plays the song for you. */
      readonly listen: boolean;
      /** The built-in piano plays the melody along with the player. */
      readonly guide: boolean;
    }
  | {
      readonly name: 'results';
      readonly level: LevelDefinition;
      readonly mode: GameMode;
      readonly speed: number;
      readonly section: PracticeSection | null;
      readonly guide: boolean;
      readonly results: GameResults;
      readonly outcome: RunOutcome;
      readonly update: ProgressUpdate;
    }
  | { readonly name: 'diagnostics' }
  | { readonly name: 'calibration'; readonly returnTo: 'home' | 'setup' }
  | { readonly name: 'import' }
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
  // "My Songs": imported licensed songs from this browser's library.
  const [collections, setCollections] = useState(allCollections());
  const reloadLibrary = useCallback(async () => {
    const stored = await listMySongs();
    setUserCollections([mySongsCollection(stored)]);
    setCollections(allCollections());
    return stored;
  }, []);
  useEffect(() => {
    void reloadLibrary();
  }, [reloadLibrary]);
  // Native app wrappers (iOS/Android) feed MIDI through window.PianoRushNative.
  const [nativeDevices, setNativeDevices] = useState<string[]>(nativeMidi.isActive ? nativeMidi.deviceNames : []);
  useEffect(() => nativeMidi.onChange(() => setNativeDevices(nativeMidi.deviceNames)), []);

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
    (
      level: LevelDefinition,
      mode: GameMode,
      speed: number = settings.practiceSpeed,
      section: PracticeSection | null = null,
      { listen = false, guide = settings.melodyGuide }: { listen?: boolean; guide?: boolean } = {},
    ) => {
      // Always called from a click: the moment browsers allow audio to start.
      audioEngine.unlock();
      // Auto: built-in piano only when nothing else makes sound (never on top of an acoustic piano).
      const virtualPiano =
        settings.pianoOutput === 'virtual' ||
        (settings.pianoOutput === 'auto' && !midiManager.isListening && !nativeMidi.isActive && microphoneInput.status !== 'listening');
      setSelected(level);
      setRun((r) => r + 1);
      // Settings are frozen for the duration of a run.
      // The input offset comes from this device configuration's calibration (PRD §6.4).
      setScreen({
        name: 'game',
        run: run + 1,
        level,
        mode,
        speed,
        section,
        settings: { ...settings, inputOffsetMs: offsetFor(settings) },
        virtualPiano,
        listen,
        guide: guide && !listen,
      });
    },
    [run, settings],
  );

  const finish = useCallback(
    (level: LevelDefinition, mode: GameMode, speed: number, section: PracticeSection | null, guide: boolean, results: GameResults) => {
      // Sections and melody-guided runs are practice: no stars, no unlocks.
      const outcome = evaluateRun(level, results, mode, speed, section !== null || guide);
      // Free-play songs never unlock anything: merge them as a list of one.
      const list = collectionOf(level).kind === 'path' ? LEVELS : [level];
      const update = applyRun(list, progress, level.id, outcome, results.score);
      setProgress(update.progress);
      saveProgress(update.progress);
      setScreen({ name: 'results', level, mode, speed, section, guide, results, outcome, update });
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
          song={screen.section ? sectionSongFor(screen.level, screen.section, screen.speed) : songFor(screen.level, screen.speed)}
          section={screen.section}
          mode={screen.mode}
          speed={screen.speed}
          inputs={INPUTS}
          settings={screen.settings}
          virtualPiano={screen.virtualPiano}
          listen={screen.listen}
          guide={screen.guide}
          onFinished={(results) => (screen.listen ? toHome() : finish(screen.level, screen.mode, screen.speed, screen.section, screen.guide, results))}
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
          section={screen.section}
          guided={screen.guide}
          onRetry={() => startLevel(screen.level, screen.mode, screen.speed, screen.section, { guide: screen.guide })}
          onPlayMode={(m, sp) => {
            updateSettings({ preferredMode: m, practiceSpeed: sp, melodyGuide: false });
            startLevel(screen.level, m, sp, null, { guide: false });
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
          currentOffsetMs={offsetFor(settings)}
          configLabel={describeConfig(configKey())}
          onApply={(offset) => {
            updateSettings({ calibrations: { ...settings.calibrations, [configKey()]: offset } });
            setScreen(screen.returnTo === 'setup' ? { name: 'setup', step: 'ready' } : { name: 'home' });
          }}
          onBack={() => setScreen(screen.returnTo === 'setup' ? { name: 'setup', step: 'ready' } : { name: 'home' })}
        />
      );
    case 'import':
      return (
        <ImportScreen
          onCancel={toHome}
          onSaved={() => {
            void reloadLibrary().then(() => {
              const mine = allCollections().find((c) => c.id === -1);
              const last = mine?.levels.at(-1);
              if (last) setSelected(last);
              toHome();
            });
          }}
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
          nativeDevices={nativeDevices}
          collections={collections}
          onImport={() => setScreen({ name: 'import' })}
          onDeleteSong={(level) => {
            void deleteMySong(level.id).then(() => reloadLibrary().then(() => setSelected(LEVELS[0]!)));
          }}
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
          onListen={() => startLevel(selected, 'flow', settings.practiceSpeed, null, { listen: true })}
          onPracticeSection={(section) => startLevel(selected, mode, settings.practiceSpeed, section)}
          onDiagnostics={() => setScreen({ name: 'diagnostics' })}
          onCalibrate={() => setScreen({ name: 'calibration', returnTo: 'home' })}
          onSetup={() => setScreen({ name: 'setup', step: 'welcome' })}
        />
      );
  }
}
