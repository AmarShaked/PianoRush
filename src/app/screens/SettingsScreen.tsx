import { InputPanel } from '../components/InputPanel';
import { PianoSoundPicker } from '../components/PianoSoundPicker';
import { TIMING_PRESETS, type PianoOutput, type Settings, type TimingPreset, type VisualEffects } from '../storage';
import { describeConfig } from '../calibrationKeys';
import { audioEngine } from '../inputs';
import { isHighLatency } from '../../audio-engine/calibration';
import type { useMidi } from '../useMidi';
import type { MicState } from '../useMic';

interface SettingsScreenProps {
  mic: MicState;
  nativeDevices: readonly string[];
  midi: ReturnType<typeof useMidi>;
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onBack: () => void;
  onCalibrate: () => void;
  onSetup: () => void;
  onDiagnostics: () => void;
}

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

/** Connect, sound, timing and display settings — kept off the kids' home screen. */
export function SettingsScreen(props: SettingsScreenProps) {
  const { mic, nativeDevices, midi, settings, onSettingsChange, onBack, onCalibrate, onSetup, onDiagnostics } = props;
  const latency = audioEngine.latency;
  const outputLatencyMs = latency?.output != null ? Math.round(latency.output * 1000) : null;

  return (
    <main className="screen settings-screen">
      <header className="top-bar">
        <button className="btn btn-secondary back-btn" onClick={onBack} autoFocus>
          ← Back
        </button>
        <h1 className="page-title">⚙️ Settings</h1>
        <span className="top-bar-spacer" />
      </header>

      <div className="settings-grid">
        <section className="card" aria-labelledby="connect-heading">
          <h2 id="connect-heading">🎹 How do you play?</h2>
          {nativeDevices.length > 0 && (
            <p className="msg ok small">
              <span className="status-dot ok" aria-hidden /> Connected through the app: {nativeDevices.join(', ')}
            </p>
          )}
          <InputPanel
            midi={midi}
            mic={mic}
            keyboardSimulator={settings.keyboardSimulator}
            onKeyboardSimulatorChange={(v) => onSettingsChange({ keyboardSimulator: v })}
          />
          <div className="home-links">
            <button className="btn btn-ghost btn-small" onClick={onSetup}>
              Setup guide
            </button>
            <button className="btn btn-ghost btn-small" onClick={onDiagnostics}>
              MIDI diagnostics
            </button>
          </div>
        </section>

        <div className="settings-col">
          <section className="card" aria-labelledby="sound-heading">
            <h2 id="sound-heading">🔊 Sound</h2>
            <label className="field">
              <span>Who makes the piano sound?</span>
              <select value={settings.pianoOutput} onChange={(e) => onSettingsChange({ pianoOutput: e.target.value as PianoOutput })}>
                <option value="auto">Auto — built-in unless a MIDI piano is connected</option>
                <option value="physical">My piano makes the sound</option>
                <option value="virtual">Built-in piano sound</option>
              </select>
              <small className="muted">The backing track never plays your melody (unless the helper or Listen is on), so nothing is doubled.</small>
            </label>
            <PianoSoundPicker value={settings.pianoSound} onChange={(pianoSound) => onSettingsChange({ pianoSound })} />
            <Slider label="Backing track" value={settings.backingVolume} onChange={(v) => onSettingsChange({ backingVolume: v })} />
            <Slider label="Built-in piano" value={settings.pianoVolume} onChange={(v) => onSettingsChange({ pianoVolume: v })} />
            <Slider label="Clicks" value={settings.metronomeVolume} onChange={(v) => onSettingsChange({ metronomeVolume: v })} />
            <Slider label="Sound effects" value={settings.effectsVolume} onChange={(v) => onSettingsChange({ effectsVolume: v })} />
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
          </section>

          <section className="card" aria-labelledby="display-heading">
            <h2 id="display-heading">👀 What you see</h2>
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
              <span>Computer-key letters in the game</span>
            </label>
            <label className="field">
              <span>Visual effects</span>
              <select value={settings.visualEffects} onChange={(e) => onSettingsChange({ visualEffects: e.target.value as VisualEffects })}>
                <option value="full">Full</option>
                <option value="reduced">Reduced (no particles or pulsing)</option>
                <option value="minimal">Minimal (feedback only)</option>
              </select>
            </label>
          </section>

          <section className="card" aria-labelledby="timing-heading">
            <h2 id="timing-heading">⏱️ Timing</h2>
            <button className="btn btn-secondary btn-small" onClick={onCalibrate}>
              Calibrate timing…
            </button>
            <label className="field">
              <span>How strict is the timing? (Learn &amp; Play)</span>
              <select value={settings.timingPreset} onChange={(e) => onSettingsChange({ timingPreset: e.target.value as TimingPreset })}>
                {(Object.keys(TIMING_PRESETS) as TimingPreset[]).map((k) => (
                  <option key={k} value={k}>
                    {TIMING_PRESETS[k].label} (Perfect ±{TIMING_PRESETS[k].windows.perfect} ms)
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>
                Default input offset: <b>{settings.inputOffsetMs} ms</b>
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
            {Object.keys(settings.calibrations).length > 0 && (
              <div className="field">
                <span>Calibrated devices</span>
                <ul className="cal-list">
                  {Object.entries(settings.calibrations).map(([key, ms]) => (
                    <li key={key}>
                      {describeConfig(key)}: <b>{ms} ms</b>{' '}
                      <button
                        className="link-btn inline"
                        onClick={() => {
                          const { [key]: _removed, ...rest } = settings.calibrations;
                          onSettingsChange({ calibrations: rest });
                        }}
                      >
                        reset
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
