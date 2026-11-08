import { useEffect, useRef, useState } from 'react';
import { analyzeTaps, isHighLatency, type TapAnalysis } from '../../audio-engine/calibration';
import type { PianoInputSource } from '../../piano-input/types';
import { audioEngine, keyboardSimulator } from '../inputs';

interface CalibrationScreenProps {
  inputs: readonly PianoInputSource[];
  keyboardSimulatorEnabled: boolean;
  currentOffsetMs: number;
  /** Which device configuration the result is saved for. */
  configLabel: string;
  onApply: (offsetMs: number) => void;
  onBack: () => void;
}

const COUNT_IN = 4;
const CLICKS = 12;
const INTERVAL_MS = 600; // 100 BPM

type Phase = { name: 'idle' } | { name: 'running'; heard: number; taps: number } | { name: 'done'; result: TapAnalysis };

/**
 * Tap-along calibration: listen to clicks and tap any piano key (or A S D F G)
 * on each one. The median tap offset becomes the input offset. This measures
 * what matters for play — sound-to-key timing through this device — rather
 * than reaction time, because the beat is predictable.
 */
export function CalibrationScreen({ inputs, keyboardSimulatorEnabled, currentOffsetMs, configLabel, onApply, onBack }: CalibrationScreenProps) {
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const cancel = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (keyboardSimulatorEnabled) keyboardSimulator.enable();
    return () => {
      cancel.current();
      if (keyboardSimulatorEnabled) keyboardSimulator.disable();
    };
  }, [keyboardSimulatorEnabled]);

  async function run() {
    cancel.current();
    if (!(await audioEngine.ready())) {
      setPhase({ name: 'idle' });
      return;
    }
    const latency = audioEngine.latency;
    setLatencyMs(latency?.output != null ? Math.round(latency.output * 1000) : null);
    audioEngine.setVolumes({ metronome: 0.8 });

    const first = performance.now() + 700 + audioEngine.totalLatency * 1000;
    const clickTimes = Array.from({ length: COUNT_IN + CLICKS }, (_, i) => first + i * INTERVAL_MS);
    clickTimes.forEach((t, i) =>
      audioEngine.playBacking(
        { part: 'click', beat: i, durationBeats: 0.1, velocity: 1, accent: i % 4 === 0 },
        audioEngine.contextTimeFor(t),
        0.05,
      ),
    );

    const taps: number[] = [];
    const unsubs = inputs.map((input) =>
      input.subscribe((e) => {
        if (e.type !== 'noteOn' || e.time < clickTimes[COUNT_IN]! - INTERVAL_MS / 2) return;
        taps.push(e.time);
      }),
    );
    setPhase({ name: 'running', heard: 0, taps: 0 });
    const progress = setInterval(() => {
      const heard = clickTimes.filter((t) => t <= performance.now()).length;
      setPhase({ name: 'running', heard, taps: taps.length });
    }, 100);
    const finish = setTimeout(() => {
      cleanup();
      setPhase({ name: 'done', result: analyzeTaps(clickTimes.slice(COUNT_IN), taps) });
    }, clickTimes.at(-1)! - performance.now() + 900);

    function cleanup() {
      clearInterval(progress);
      clearTimeout(finish);
      unsubs.forEach((u) => u());
    }
    cancel.current = () => {
      cleanup();
      audioEngine.stopBacking(0.02);
    };
  }

  const result = phase.name === 'done' ? phase.result : null;

  return (
    <main className="screen results-screen">
      <section className="card results-card" aria-labelledby="cal-title">
        <div className="eyebrow">Settings</div>
        <h2 id="cal-title">Timing calibration</h2>
        <p className="small muted">Saved for: <b>{configLabel}</b></p>
        <p className="muted">
          You'll hear 4 count-in clicks, then {CLICKS} more. On each of the {CLICKS}, play any key on your piano (or A S D F G) exactly with the
          click. Listen rather than watch — close your eyes if it helps.
        </p>

        {phase.name === 'running' && (
          <div className="cal-progress" aria-live="polite">
            <div className="cal-dots">
              {Array.from({ length: COUNT_IN + CLICKS }, (_, i) => (
                <span key={i} className={`cal-dot${i < COUNT_IN ? ' count' : ''}${i < phase.heard ? ' on' : ''}`} />
              ))}
            </div>
            <p className="small muted">
              {phase.heard <= COUNT_IN ? 'Get ready…' : 'Tap with the clicks'} · {phase.taps} taps
            </p>
          </div>
        )}

        {result && (
          <div className="cal-result">
            {result.medianMs === null ? (
              <p className="msg warn">No taps were detected. Make sure your piano is connected (or the keyboard simulator is on) and try again.</p>
            ) : (
              <dl className="diag-list big">
                <dt>Your taps vs. clicks</dt>
                <dd>
                  {result.medianMs >= 0 ? '+' : ''}
                  {Math.round(result.medianMs)} ms ({result.medianMs >= 0 ? 'after' : 'before'} the click)
                </dd>
                <dt>Consistency</dt>
                <dd>±{Math.round(result.spreadMs ?? 0)} ms over {result.offsets.length} taps</dd>
                <dt>Current offset for this setup</dt>
                <dd>{currentOffsetMs} ms</dd>
              </dl>
            )}
            {result.medianMs !== null && !result.reliable && (
              <p className="msg warn">The taps were too few or too uneven to be sure. Try once more, tapping steadily with the clicks.</p>
            )}
            {result.reliable && result.suggestedOffsetMs !== null && (
              <button className="btn btn-primary" onClick={() => onApply(result.suggestedOffsetMs!)}>
                Use {result.suggestedOffsetMs} ms input offset
              </button>
            )}
          </div>
        )}

        <dl className="diag-list small">
          <dt>Device-reported audio latency</dt>
          <dd>{latencyMs === null ? 'not reported by this browser' : `${latencyMs} ms (already compensated)`}</dd>
        </dl>
        {isHighLatency(latencyMs === null ? null : latencyMs / 1000) && (
          <p className="msg warn">
            Your audio output has high latency — typical of Bluetooth headphones or speakers. For tight timing use wired headphones or your
            computer's speakers, then calibrate again.
          </p>
        )}

        <div className="overlay-actions">
          <button className="btn btn-secondary" onClick={() => void run()} disabled={phase.name === 'running'}>
            {phase.name === 'idle' ? '▶ Start' : '↻ Run again'}
          </button>
          <button className="btn btn-ghost" onClick={onBack}>
            Back
          </button>
        </div>
      </section>
    </main>
  );
}
