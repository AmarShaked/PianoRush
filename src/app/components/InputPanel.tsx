import { DEFAULT_KEY_MAP } from '../../piano-input/KeyboardSimulator';
import { midiToNoteName } from '../../piano-input/noteNames';
import type { useMidi } from '../useMidi';

interface InputPanelProps {
  midi: ReturnType<typeof useMidi>;
  keyboardSimulator: boolean;
  onKeyboardSimulatorChange: (enabled: boolean) => void;
}

const SIM_KEYS = Object.entries(DEFAULT_KEY_MAP).map(([code, note]) => [code.replace('Key', ''), midiToNoteName(note)] as const);

export function InputPanel({ midi, keyboardSimulator, onKeyboardSimulatorChange }: InputPanelProps) {
  const connectedDevices = midi.devices.filter((d) => d.connected);
  const selected = midi.devices.find((d) => d.id === midi.selectedId);

  return (
    <div className="input-panel">
      <section className="panel-block" aria-labelledby="midi-heading">
        <h3 id="midi-heading">
          <span className={`status-dot ${midi.listening ? 'ok' : midi.status === 'granted' ? 'warn' : ''}`} aria-hidden />
          MIDI piano
        </h3>

        {!midi.supported && (
          <div className="notice">
            <strong>Web MIDI isn't available in this browser.</strong>
            <p>
              Use a recent desktop <b>Chrome</b>, <b>Edge</b>, <b>Opera</b> or <b>Firefox</b> to connect a MIDI piano. Safari (macOS and
              iOS) does not support Web MIDI. Pages must be served over <b>https</b> or <b>localhost</b>. You can still play with the
              keyboard simulator.
            </p>
          </div>
        )}

        {midi.supported && midi.status !== 'granted' && (
          <>
            <p className="muted">Plug in your piano via USB (or a MIDI interface), then connect.</p>
            <button className="btn btn-secondary" onClick={() => void midi.connect()} disabled={midi.status === 'requesting'}>
              {midi.status === 'requesting' ? 'Waiting for permission…' : 'Connect MIDI piano'}
            </button>
            {midi.status === 'denied' && (
              <div className="notice warn" role="alert">
                <strong>MIDI access was blocked.</strong>
                <p>
                  Allow MIDI in the browser's site settings (the icon left of the address bar) and try again.
                  {midi.error ? <span className="muted small"> ({midi.error})</span> : null}
                </p>
              </div>
            )}
          </>
        )}

        {midi.supported && midi.status === 'granted' && (
          <>
            {connectedDevices.length === 0 ? (
              <div className="notice">
                <strong>No MIDI devices found.</strong>
                <p>Connect your piano and switch it on — it will appear here automatically.</p>
              </div>
            ) : (
              <label className="field">
                <span>Input device</span>
                <select value={midi.selectedId ?? ''} onChange={(e) => midi.select(e.target.value || null)}>
                  <option value="">— Select your piano —</option>
                  {midi.devices.map((d) => (
                    <option key={d.id} value={d.id} disabled={!d.connected}>
                      {d.name}
                      {d.manufacturer ? ` (${d.manufacturer})` : ''}
                      {d.connected ? '' : ' — disconnected'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {selected && (
              <p className={`small ${midi.listening ? 'ok-text' : 'warn-text'}`}>
                {midi.listening ? `Listening to ${selected.name}` : `${selected.name} is disconnected — reconnect it to continue.`}
              </p>
            )}
          </>
        )}
      </section>

      <section className="panel-block" aria-labelledby="sim-heading">
        <h3 id="sim-heading">
          <span className={`status-dot ${keyboardSimulator ? 'ok' : ''}`} aria-hidden />
          Computer keyboard
        </h3>
        <label className="toggle">
          <input type="checkbox" checked={keyboardSimulator} onChange={(e) => onKeyboardSimulatorChange(e.target.checked)} />
          <span>Play with keyboard simulator</span>
        </label>
        <div className="keycaps" aria-label="Keyboard simulator mapping">
          {SIM_KEYS.map(([key, note]) => (
            <span key={key} className="keycap">
              <kbd>{key}</kbd>
              <small>{note}</small>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
