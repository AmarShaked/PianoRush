import { useCallback, useEffect, useState } from 'react';
import type { GameResults } from '../game-engine/GameEngine';
import { compileSong } from '../song-content/compile';
import { starlightSteps } from '../song-content';
import type { PianoInputSource } from '../piano-input/types';
import { keyboardSimulator, midiManager } from './inputs';
import { getBestScore, loadSettings, recordScore, saveSettings, type Settings } from './storage';
import { useMidi } from './useMidi';
import { StartScreen } from './screens/StartScreen';
import { GameScreen } from './screens/GameScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';

// M1 ships a single level. The song catalog / level progression plugs in here later.
const SONG = compileSong(starlightSteps);
const INPUTS: readonly PianoInputSource[] = [midiManager, keyboardSimulator];

type Screen =
  | { readonly name: 'start' }
  | { readonly name: 'game'; readonly run: number; readonly settings: Settings }
  | { readonly name: 'results'; readonly results: GameResults; readonly previousBest: number }
  | { readonly name: 'diagnostics' };

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [screen, setScreen] = useState<Screen>({ name: 'start' });
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

  const play = useCallback(() => {
    setRun((r) => r + 1);
    // Settings are frozen for the duration of a run.
    setScreen({ name: 'game', run: run + 1, settings });
  }, [run, settings]);

  const finish = useCallback((results: GameResults) => {
    const previousBest = recordScore(results.songId, results.score);
    setScreen({ name: 'results', results, previousBest });
  }, []);

  const toMenu = useCallback(() => setScreen({ name: 'start' }), []);

  switch (screen.name) {
    case 'game':
      return <GameScreen key={screen.run} song={SONG} inputs={INPUTS} settings={screen.settings} onFinished={finish} onQuit={toMenu} />;
    case 'results':
      return (
        <ResultsScreen
          title={SONG.definition.title}
          results={screen.results}
          previousBest={screen.previousBest}
          onRetry={play}
          onMenu={toMenu}
        />
      );
    case 'diagnostics':
      return (
        <DiagnosticsScreen
          midi={midi}
          keyboardSimulatorEnabled={settings.keyboardSimulator}
          onKeyboardSimulatorChange={(v) => updateSettings({ keyboardSimulator: v })}
          lanes={SONG.definition.lanes}
          onBack={toMenu}
        />
      );
    default:
      return (
        <StartScreen
          song={SONG}
          bestScore={getBestScore(SONG.definition.id)}
          midi={midi}
          settings={settings}
          onSettingsChange={updateSettings}
          onPlay={play}
          onDiagnostics={() => setScreen({ name: 'diagnostics' })}
        />
      );
  }
}
