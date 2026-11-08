import type { CompiledSong } from '../../song-content/compile';
import { DEFAULT_KEY_MAP } from '../../piano-input/KeyboardSimulator';
import { InputPanel } from '../components/InputPanel';
import { MiniKeyboard } from '../components/MiniKeyboard';
import { TIMING_PRESETS, type Settings, type TimingPreset } from '../storage';
import type { useMidi } from '../useMidi';

interface StartScreenProps {
  song: CompiledSong;
  bestScore: number;
  midi: ReturnType<typeof useMidi>;
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onPlay: () => void;
  onDiagnostics: () => void;
}

const KEY_HINTS: Record<number, string> = Object.fromEntries(
  Object.entries(DEFAULT_KEY_MAP).map(([code, note]) => [note, code.replace('Key', '')]),
);

export function StartScreen({ song, bestScore, midi, settings, onSettingsChange, onPlay, onDiagnostics }: StartScreenProps) {
  const def = song.definition;
  const canPlay = midi.listening || settings.keyboardSimulator;
  const seconds = Math.round((song.endMs + song.countInMs) / 1000);

  return (
    <main className="screen start-screen">
      <header className="brand">
        <h1>
          Piano<span>Rush</span>
        </h1>
        <p className="tagline">Play real piano. Feel like a rhythm game.</p>
      </header>

      <div className="start-grid">
        <section className="card song-card" aria-labelledby="song-title">
          <div className="eyebrow">World 1 · Test level</div>
          <h2 id="song-title">{def.title}</h2>
          <p className="muted">{def.composer}</p>
          <dl className="song-meta">
            <div>
              <dt>Tempo</dt>
              <dd>{def.bpm} BPM</dd>
            </div>
            <div>
              <dt>Length</dt>
              <dd>{seconds}s</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{song.notes.length}</dd>
            </div>
            <div>
              <dt>Best</dt>
              <dd>{bestScore > 0 ? bestScore.toLocaleString() : '—'}</dd>
            </div>
          </dl>

          <div className="guide">
            <h3>Find your keys</h3>
            <p className="muted small">
              Put your right thumb on <b>middle C</b> — the C nearest the centre of your piano, usually just left of the brand
              name. Your five fingers rest on C D E F G, one per lane.
            </p>
            <MiniKeyboard
              className="guide-keyboard"
              from={48}
              to={83}
              lanes={def.lanes}
              keyHints={settings.keyboardSimulator ? KEY_HINTS : {}}
            />
          </div>

          <button className="btn btn-primary btn-play" onClick={onPlay} disabled={!canPlay} autoFocus>
            ▶ Play
          </button>
          {!canPlay && <p className="small warn-text center">Connect a MIDI piano or enable the keyboard simulator.</p>}
        </section>

        <section className="card" aria-labelledby="input-heading">
          <h2 id="input-heading">Connect</h2>
          <InputPanel
            midi={midi}
            keyboardSimulator={settings.keyboardSimulator}
            onKeyboardSimulatorChange={(v) => onSettingsChange({ keyboardSimulator: v })}
          />

          <details className="settings">
            <summary>Settings</summary>
            <label className="field">
              <span>Timing windows</span>
              <select
                value={settings.timingPreset}
                onChange={(e) => onSettingsChange({ timingPreset: e.target.value as TimingPreset })}
              >
                {(Object.keys(TIMING_PRESETS) as TimingPreset[]).map((k) => (
                  <option key={k} value={k}>
                    {TIMING_PRESETS[k].label} (Perfect ±{TIMING_PRESETS[k].windows.perfect} ms)
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>
                Input offset: <b>{settings.inputOffsetMs} ms</b>
              </span>
              <input
                type="range"
                min={-150}
                max={150}
                step={5}
                value={settings.inputOffsetMs}
                onChange={(e) => onSettingsChange({ inputOffsetMs: Number(e.target.value) })}
              />
              <small className="muted">Increase if hits are judged LATE even when they feel on time.</small>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={settings.showKeyHints} onChange={(e) => onSettingsChange({ showKeyHints: e.target.checked })} />
              <span>Show keyboard-key hints in game</span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={settings.reducedMotion} onChange={(e) => onSettingsChange({ reducedMotion: e.target.checked })} />
              <span>Reduced motion</span>
            </label>
          </details>

          <button className="btn btn-ghost" onClick={onDiagnostics}>
            MIDI diagnostics
          </button>
        </section>
      </div>
    </main>
  );
}
