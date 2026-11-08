import { DEFAULT_KEY_MAP } from '../../piano-input/KeyboardSimulator';
import { midiToNoteName } from '../../piano-input/noteNames';
import { songFor } from '../catalog';
import { GAME_MODES, type GameMode, type LevelDefinition, type WorldDefinition } from '../../song-content/level';
import { isLevelUnlocked, totalStars, type ProgressMap } from '../../game-engine/progression';
import { InputPanel } from '../components/InputPanel';
import { MiniKeyboard } from '../components/MiniKeyboard';
import { Stars } from '../components/Stars';
import { TIMING_PRESETS, type PianoOutput, type Settings, type TimingPreset } from '../storage';
import { audioEngine } from '../inputs';
import { isHighLatency } from '../../audio-engine/calibration';
import type { useMidi } from '../useMidi';
import { MODE_LABEL } from './GameScreen';

interface HomeScreenProps {
  world: WorldDefinition;
  progress: ProgressMap;
  selected: LevelDefinition;
  onSelect: (level: LevelDefinition) => void;
  mode: GameMode;
  onModeChange: (mode: GameMode) => void;
  midi: ReturnType<typeof useMidi>;
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onPlay: () => void;
  onDiagnostics: () => void;
  onCalibrate: () => void;
}

const KEY_HINTS: Record<number, string> = Object.fromEntries(
  Object.entries(DEFAULT_KEY_MAP).map(([code, note]) => [note, code.replace('Key', '')]),
);

const MODE_INFO: Record<GameMode, { icon: string; text: string }> = {
  discover: { icon: '🧭', text: 'Learn the notes. The music waits for you. (Practice — no stars)' },
  flow: { icon: '🎵', text: 'Play along at full tempo. The music keeps going. Earn stars.' },
  challenge: { icon: '🏆', text: 'Strict timing. Clear it to earn the trophy.' },
};

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="field slider">
      <span>
        {label} <b>{Math.round(value * 100)}%</b>
      </span>
      <input type="range" min={0} max={1} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function HomeScreen(props: HomeScreenProps) {
  const { world, progress, selected, onSelect, mode, onModeChange, midi, settings, onSettingsChange, onPlay, onDiagnostics, onCalibrate } = props;
  const latency = audioEngine.latency;
  const outputLatencyMs = latency?.output != null ? Math.round(latency.output * 1000) : null;
  const levels = world.levels;
  const selectedIndex = levels.indexOf(selected);
  const unlocked = isLevelUnlocked(levels, selectedIndex, progress);
  const hasInput = midi.listening || settings.keyboardSimulator;
  const song = songFor(selected);
  const seconds = Math.round((song.endMs + song.countInMs) / 1000);
  const p = progress[selected.id];
  const earned = totalStars(levels, progress);

  return (
    <main className="screen home-screen">
      <header className="home-header">
        <h1 className="logo">
          Piano<span>Rush</span>
        </h1>
        <div className="star-total" aria-label={`${earned} of ${levels.length * 3} stars collected`}>
          ★ {earned} / {levels.length * 3}
        </div>
      </header>

      <div className="start-grid">
        <section className="card world-card" aria-labelledby="world-title">
          <div className="eyebrow">World {world.id}</div>
          <h2 id="world-title">{world.title}</h2>
          <p className="muted small">{world.subtitle}</p>

          <ol className="level-grid">
            {levels.map((level, i) => {
              const open = isLevelUnlocked(levels, i, progress);
              const lp = progress[level.id];
              const isNext = open && !lp?.completed;
              return (
                <li key={level.id}>
                  <button
                    className={`level-tile${level === selected ? ' selected' : ''}${open ? '' : ' locked'}${isNext ? ' next' : ''}`}
                    onClick={() => onSelect(level)}
                    aria-pressed={level === selected}
                    aria-label={`Level ${level.number}: ${level.title}${open ? `, ${lp?.bestStars ?? 0} stars` : ', locked'}`}
                  >
                    <span className="level-num">{open ? level.number : '🔒'}</span>
                    <span className="level-name">{level.title}</span>
                    <Stars count={lp?.bestStars ?? 0} small />
                    {lp?.challengeCleared && <span className="trophy" aria-hidden>🏆</span>}
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="level-detail">
            <div className="level-detail-head">
              <div>
                <div className="eyebrow">Level {selected.number}</div>
                <h3 className="level-title">{selected.title}</h3>
                <p className="objective">{selected.objective}</p>
                <p className="muted small">
                  “{selected.song.title}” · {selected.song.bpm} BPM · {seconds}s · keys {selected.song.lanes.map(midiToNoteName).join(' ')}
                </p>
              </div>
              {p && (p.bestScore > 0 || p.discoverPlayed) && (
                <div className="best">
                  <Stars count={p.bestStars} />
                  <span className="muted small">Best {p.bestScore.toLocaleString()}</span>
                </div>
              )}
            </div>

            <MiniKeyboard
              className="guide-keyboard"
              from={48}
              to={83}
              lanes={selected.song.lanes}
              keyHints={settings.keyboardSimulator ? KEY_HINTS : {}}
            />

            <div className="mode-picker" role="radiogroup" aria-label="Game mode">
              {GAME_MODES.filter((m) => selected.modes.includes(m)).map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={mode === m}
                  className={`mode-option mode-${m}${mode === m ? ' active' : ''}`}
                  onClick={() => onModeChange(m)}
                >
                  <span className="mode-name">
                    {MODE_INFO[m].icon} {MODE_LABEL[m]}
                  </span>
                  <span className="mode-text">{MODE_INFO[m].text}</span>
                </button>
              ))}
            </div>

            <button className="btn btn-primary btn-play" onClick={onPlay} disabled={!unlocked || !hasInput}>
              ▶ Play {MODE_LABEL[mode]}
            </button>
            {!unlocked && (
              <p className="small warn-text center">Complete level {selected.number - 1} to unlock this level.</p>
            )}
            {unlocked && !hasInput && <p className="small warn-text center">Connect a MIDI piano or enable the keyboard simulator.</p>}
          </div>
        </section>

        <section className="card" aria-labelledby="input-heading">
          <h2 id="input-heading">Connect</h2>
          <InputPanel
            midi={midi}
            keyboardSimulator={settings.keyboardSimulator}
            onKeyboardSimulatorChange={(v) => onSettingsChange({ keyboardSimulator: v })}
          />

          <details className="settings" open>
            <summary>Sound</summary>
            <label className="field">
              <span>Piano sound</span>
              <select value={settings.pianoOutput} onChange={(e) => onSettingsChange({ pianoOutput: e.target.value as PianoOutput })}>
                <option value="auto">Auto — built-in unless a MIDI piano is connected</option>
                <option value="physical">My piano makes the sound</option>
                <option value="virtual">Built-in piano sound</option>
              </select>
              <small className="muted">The backing track never plays your melody, so nothing is doubled.</small>
            </label>
            <Slider label="Backing track" value={settings.backingVolume} onChange={(v) => onSettingsChange({ backingVolume: v })} />
            <Slider label="Built-in piano" value={settings.pianoVolume} onChange={(v) => onSettingsChange({ pianoVolume: v })} />
            <Slider label="Clicks" value={settings.metronomeVolume} onChange={(v) => onSettingsChange({ metronomeVolume: v })} />
            <label className="toggle">
              <input type="checkbox" checked={settings.metronome} onChange={(e) => onSettingsChange({ metronome: e.target.checked })} />
              <span>Metronome click during songs</span>
            </label>
            {outputLatencyMs !== null && (
              <p className={`small ${isHighLatency(outputLatencyMs / 1000) ? 'warn-text' : 'muted'}`}>
                Audio output latency: {outputLatencyMs} ms
                {isHighLatency(outputLatencyMs / 1000) ? ' — high (Bluetooth?). Wired headphones or speakers keep timing tight.' : ''}
              </p>
            )}
          </details>

          <details className="settings">
            <summary>Timing &amp; display</summary>
            <button className="btn btn-secondary btn-small" onClick={onCalibrate}>
              Calibrate timing…
            </button>
            <label className="field">
              <span>Timing windows (Discover &amp; Flow)</span>
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
