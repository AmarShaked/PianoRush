import { useEffect, useState } from 'react';
import { keyboardSimulator, microphoneInput, midiManager } from '../inputs';
import { InputPanel } from '../components/InputPanel';
import { MiniKeyboard } from '../components/MiniKeyboard';
import { midiToNoteName } from '../../piano-input/noteNames';
import type { PianoEvent } from '../../piano-input/types';
import type { useMidi } from '../useMidi';

interface DiagnosticsScreenProps {
  midi: ReturnType<typeof useMidi>;
  keyboardSimulatorEnabled: boolean;
  onKeyboardSimulatorChange: (enabled: boolean) => void;
  lanes: readonly number[];
  onBack: () => void;
}

interface LogEntry {
  readonly id: number;
  readonly event: PianoEvent;
  /** False if the event was dropped as a duplicate / orphan by the input layer. */
  readonly accepted: boolean;
}

const MAX_LOG = 40;

/** Live view of the normalized input stream, for verifying real hardware. */
export function DiagnosticsScreen({ midi, keyboardSimulatorEnabled, onKeyboardSimulatorChange, lanes, onBack }: DiagnosticsScreenProps) {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [held, setHeld] = useState<number[]>([]);
  const [pedal, setPedal] = useState<boolean | null>(null);
  const [statusLog, setStatusLog] = useState<string[]>([]);

  useEffect(() => {
    let id = 0;
    const push = (event: PianoEvent, accepted: boolean) =>
      setLog((prev) => [{ id: id++, event, accepted }, ...prev].slice(0, MAX_LOG));
    const refreshHeld = () => setHeld([...new Set([...midiManager.heldNotes(), ...keyboardSimulator.heldNotes()])].sort((a, b) => a - b));

    // MIDI: the raw stream sees every parsed note message; the filtered stream is what
    // reaches the game. A raw event that never shows up filtered was dropped as a
    // duplicate noteOn or orphan noteOff — show it greyed out.
    const accepted = new WeakSet<PianoEvent>();
    const offRaw = midiManager.subscribeRaw((e) => {
      queueMicrotask(() => {
        if (!accepted.has(e)) push(e, false);
      });
    });
    const offMidi = midiManager.subscribe((e) => {
      accepted.add(e);
      push(e, true);
      refreshHeld();
    });
    const offKeys = keyboardSimulator.subscribe((e) => {
      push(e, true);
      refreshHeld();
    });
    const offMic = microphoneInput.subscribe((e) => push(e, true));
    const offPedals = [midiManager, keyboardSimulator].map((input) => input.subscribePedal((p) => setPedal(p.down)));
    const offStatus = midiManager.subscribeStatus((s) =>
      setStatusLog((prev) => [`${new Date().toLocaleTimeString()} — ${s.deviceName} ${s.type}`, ...prev].slice(0, 8)),
    );
    if (keyboardSimulatorEnabled) keyboardSimulator.enable();
    return () => {
      offRaw();
      offMidi();
      offKeys();
      offMic();
      offPedals.forEach((off) => off());
      offStatus();
      keyboardSimulator.disable();
    };
  }, [keyboardSimulatorEnabled]);

  const last = log[0]?.event;
  const selected = midi.devices.find((d) => d.id === midi.selectedId);

  return (
    <main className="screen diagnostics-screen">
      <header className="diag-header">
        <button className="btn btn-ghost" onClick={onBack}>
          ← Back
        </button>
        <h1>MIDI diagnostics</h1>
      </header>

      <div className="diag-grid">
        <section className="card">
          <h2>Input</h2>
          <InputPanel midi={midi} keyboardSimulator={keyboardSimulatorEnabled} onKeyboardSimulatorChange={onKeyboardSimulatorChange} />
          <dl className="diag-list">
            <dt>Web MIDI</dt>
            <dd>{midi.supported ? `supported · ${midi.status}` : 'not supported in this browser'}</dd>
            <dt>Connected device</dt>
            <dd>{selected ? `${selected.name}${midi.listening ? '' : ' (disconnected)'}` : '—'}</dd>
            <dt>Devices seen</dt>
            <dd>{midi.devices.length ? midi.devices.map((d) => `${d.name}${d.connected ? '' : ' ✕'}`).join(', ') : '—'}</dd>
          </dl>
          {statusLog.length > 0 && (
            <ul className="status-log small muted">
              {statusLog.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-live="polite">
          <h2>Last event</h2>
          {last ? (
            <dl className="diag-list big">
              <dt>Note</dt>
              <dd>
                <b>{midiToNoteName(last.note)}</b>
              </dd>
              <dt>MIDI pitch</dt>
              <dd>{last.note}</dd>
              <dt>Velocity</dt>
              <dd>{last.velocity}</dd>
              <dt>Event type</dt>
              <dd className={last.type === 'noteOn' ? 'ok-text' : 'muted'}>{last.type === 'noteOn' ? 'Note On' : 'Note Off'}</dd>
              <dt>Timestamp</dt>
              <dd>{last.time.toFixed(2)} ms</dd>
              <dt>Channel</dt>
              <dd>{last.channel + 1}</dd>
              <dt>Source</dt>
              <dd>{last.source === 'midi' ? 'MIDI' : last.source === 'microphone' ? 'Microphone (beta)' : 'Keyboard simulator'}</dd>
            </dl>
          ) : (
            <p className="muted">Press a key on your piano (or A S D F G)…</p>
          )}

          <h3>Sustain pedal</h3>
          <p>
            {pedal === null ? (
              <span className="muted">not pressed yet (MIDI CC64, or hold Space on the computer keyboard)</span>
            ) : (
              <span className={`chip${pedal ? ' chip-on' : ''}`}>{pedal ? 'down' : 'up'}</span>
            )}
          </p>
          <h3>Held notes</h3>
          <div className="chips">
            {held.length ? held.map((n) => <span key={n} className="chip">{midiToNoteName(n)} · {n}</span>) : <span className="muted">none</span>}
          </div>
          <MiniKeyboard className="diag-keyboard" from={36} to={95} lanes={lanes} pressed={held} />
        </section>

        <section className="card diag-log-card">
          <h2>Event log</h2>
          <table className="event-log">
            <thead>
              <tr>
                <th>Time (ms)</th>
                <th>Type</th>
                <th>Note</th>
                <th>Vel</th>
                <th>Source</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {log.map(({ id, event: e, accepted }) => (
                <tr key={id} className={accepted ? '' : 'filtered'}>
                  <td>{e.time.toFixed(1)}</td>
                  <td>{e.type === 'noteOn' ? 'On' : 'Off'}</td>
                  <td>
                    {midiToNoteName(e.note)} <span className="muted">({e.note})</span>
                  </td>
                  <td>{e.velocity}</td>
                  <td>{e.source}</td>
                  <td className="small">{accepted ? '' : 'filtered (duplicate/orphan)'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
