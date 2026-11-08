import { DEFAULT_KEY_MAP, keyLabel } from '../../piano-input/KeyboardSimulator';
import { midiToNoteName } from '../../piano-input/noteNames';
import { isPlayable, songFor } from '../catalog';
import { GAME_MODES, type GameMode, type LevelDefinition, type WorldDefinition } from '../../song-content/level';
import { PRACTICE_SPEEDS, totalStars, type ProgressMap } from '../../game-engine/progression';
import { InputPanel } from '../components/InputPanel';
import { MiniKeyboard } from '../components/MiniKeyboard';
import { Stars } from '../components/Stars';
import { TIMING_PRESETS, type PianoOutput, type Settings, type TimingPreset } from '../storage';
import { audioEngine } from '../inputs';
import { isHighLatency } from '../../audio-engine/calibration';
import type { useMidi } from '../useMidi';
import type { MicState } from '../useMic';
import { MODE_LABEL } from './GameScreen';

interface HomeScreenProps {
  mic: MicState;
  collections: readonly WorldDefinition[];
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
  onSetup: () => void;
}

const KEY_HINTS: Record<number, string> = Object.fromEntries(
  Object.entries(DEFAULT_KEY_MAP).map(([code, note]) => [note, keyLabel(code)]),
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
  const { mic, collections, world, progress, selected, onSelect, mode, onModeChange, midi, settings, onSettingsChange, onPlay, onDiagnostics, onCalibrate, onSetup } = props;
  const latency = audioEngine.latency;
  const outputLatencyMs = latency?.output != null ? Math.round(latency.output * 1000) : null;
  const levels = world.levels;
  const freePlay = world.kind === 'freeplay';
  const isOpen = (i: number) => isPlayable(levels[i]!, progress);
  const selectedIndex = levels.indexOf(selected);
  const song = songFor(selected);
  const unlocked = isOpen(selectedIndex);
  const hasInput = midi.listening || settings.keyboardSimulator || mic.status === 'listening';
  const hasChords = song.events.some((e) => e.noteIds.length > 1);

  const seconds = Math.round((song.endMs + song.countInMs) / 1000);
  const p = progress[selected.id];
  const path = collections.filter((c) => c.kind === 'path').flatMap((c) => c.levels);
  const earned = totalStars(path, progress);

  return (
    <main className="screen home-screen">
      <header className="home-header">
        <h1 className="logo">
          Piano<span>Rush</span>
        </h1>
        <div className="star-total" aria-label={`${earned} of ${path.length * 3} stars collected`}>
          ★ {earned} / {path.length * 3}
        </div>
      </header>

      <div className="start-grid">
        <section className="card world-card" aria-label={world.title}>
          <div className="collection-tabs" role="tablist" aria-label="Song collections">
            {collections.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={c === world}
                className={`collection-tab${c === world ? ' active' : ''}`}
                onClick={() => {
                  if (c === world) return;
                  // Jump to the first open, unfinished entry of that collection.
                  const first = c.levels.find((l) => isPlayable(l, progress) && !progress[l.id]?.completed);
                  onSelect(first ?? c.levels[0]!);
                }}
              >
                {c.kind === 'path' ? (
                  <>
                    <span className="tab-num">{c.id}</span> {c.title}
                  </>
                ) : (
                  `🔥 ${c.title}`
                )}
              </button>
            ))}
          </div>
          <p className="muted small">{world.subtitle}</p>

          <ol className="level-grid">
            {levels.map((level, i) => {
              const open = isOpen(i);
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
                    <span className="level-num">{!open ? '🔒' : freePlay ? '♪' : level.number}</span>
                    <span className="level-name">{level.title}</span>
                    {!freePlay && level.song.composer.includes('public domain') && <span className="famous" aria-hidden>★ hit</span>}
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
                <div className="eyebrow">{freePlay ? 'Free play' : `Level ${selected.number}`}</div>
                <h3 className="level-title">{selected.title}</h3>
                <p className="objective">{selected.objective}</p>
                <p className="muted small">
                  {!freePlay && `“${selected.song.title}” · `}
                  {selected.song.bpm} BPM · {seconds}s · keys {selected.song.lanes.map((m) => midiToNoteName(m, selected.song.preferFlats)).join(' ')}
                </p>
                <p className="muted small credit">{selected.song.composer}</p>
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
              from={Math.min(48, Math.floor(Math.min(...selected.song.lanes) / 12) * 12)}
              to={Math.max(83, Math.ceil((Math.max(...selected.song.lanes) + 1) / 12) * 12 - 1)}
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

            <div className="speed-picker" role="radiogroup" aria-label="Practice speed">
              <span className="small muted">Speed</span>
              {PRACTICE_SPEEDS.map((sp) => (
                <button
                  key={sp}
                  role="radio"
                  aria-checked={settings.practiceSpeed === sp}
                  className={`speed-option${settings.practiceSpeed === sp ? ' active' : ''}`}
                  onClick={() => onSettingsChange({ practiceSpeed: sp })}
                >
                  {sp === 1 ? 'Full' : `${sp * 100}%`}
                </button>
              ))}
              {settings.practiceSpeed < 1 && <span className="small muted">practice: no stars</span>}
            </div>

            <button className="btn btn-primary btn-play" onClick={onPlay} disabled={!unlocked || !hasInput}>
              ▶ Play {MODE_LABEL[mode]}
              {settings.practiceSpeed < 1 ? ` · ${settings.practiceSpeed * 100}%` : ''}
            </button>
            {!unlocked && (
              <p className="small warn-text center">
                {selected.number === 1
                  ? `Complete World ${selected.world - 1}'s final level to open World ${selected.world}.`
                  : `Complete level ${selected.number - 1} to unlock this level.`}
              </p>
            )}
            {unlocked && !hasInput && <p className="small warn-text center">Connect a MIDI piano or enable the keyboard simulator.</p>}
            {mic.status === 'listening' && !midi.listening && hasChords && (
              <p className="small warn-text center">This level has chords — the microphone (beta) hears one note at a time. A MIDI piano works best here.</p>
            )}
          </div>
        </section>

        <section className="card" aria-labelledby="input-heading">
          <h2 id="input-heading">Connect</h2>
          <InputPanel
            midi={midi}
            mic={mic}
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
              <input type="checkbox" checked={settings.showNoteLabels} onChange={(e) => onSettingsChange({ showNoteLabels: e.target.checked })} />
              <span>Note letters on tiles</span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={settings.showFingers} onChange={(e) => onSettingsChange({ showFingers: e.target.checked })} />
              <span>Finger numbers on keys</span>
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

          <div className="home-links">
            <button className="btn btn-ghost" onClick={onSetup}>
              Setup guide
            </button>
            <button className="btn btn-ghost" onClick={onDiagnostics}>
              MIDI diagnostics
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
