import { useEffect, useState } from 'react';
import { arrange } from '../../audio-engine/arranger';
import { keyFeedback } from '../../piano-input/keyFinding';
import { midiToNoteName } from '../../piano-input/noteNames';
import type { PianoInputSource } from '../../piano-input/types';
import { InputPanel } from '../components/InputPanel';
import { MiniKeyboard } from '../components/MiniKeyboard';
import { LEVELS, songFor } from '../catalog';
import { audioEngine, keyboardSimulator } from '../inputs';
import type { PianoOutput, Settings } from '../storage';
import type { useMidi } from '../useMidi';
import type { MicState } from '../useMic';

export type SetupStep = 'welcome' | 'input' | 'connect' | 'keys' | 'sound' | 'ready';

interface SetupScreenProps {
  mic: MicState;
  initialStep?: SetupStep;
  midi: ReturnType<typeof useMidi>;
  inputs: readonly PianoInputSource[];
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onCalibrate: () => void;
  /** Leave the guide: start level 1 or go to level select. */
  onDone: (startFirstLevel: boolean) => void;
}

const TARGETS = [60, 62, 64, 65, 67];
const STEPS: SetupStep[] = ['welcome', 'input', 'connect', 'keys', 'sound', 'ready'];

/**
 * First-launch guide (PRD §10): welcome → input method → connect → find your
 * keys → sound → (optional) calibration → first level. Skippable at any step.
 */
export function SetupScreen({ mic, initialStep = 'welcome', midi, inputs, settings, onSettingsChange, onCalibrate, onDone }: SetupScreenProps) {
  const [step, setStep] = useState<SetupStep>(initialStep);
  const [method, setMethod] = useState<'midi' | 'keyboard' | 'mic'>(midi.listening ? 'midi' : 'keyboard');
  const index = STEPS.indexOf(step);
  const next = (s: SetupStep) => {
    audioEngine.unlock(); // every "next" is a click: a good moment to allow audio
    setStep(s);
  };

  return (
    <main className="screen results-screen setup-screen">
      <section className="card setup-card" aria-labelledby="setup-title">
        <ol className="setup-steps" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <li key={s} className={i < index ? 'done' : i === index ? 'current' : ''} aria-current={i === index ? 'step' : undefined} />
          ))}
        </ol>

        {step === 'welcome' && (
          <>
            <h1 className="logo center">
              Piano<span>Rush</span>
            </h1>
            <h2 id="setup-title" className="center">Play real piano. Feel like a rhythm game.</h2>
            <p className="muted center">
              Tiles fall toward a line; each lane is one key on your piano. Play the key when its tile reaches the line — to a real
              backing track. Let's get you set up in about a minute.
            </p>
            <div className="overlay-actions">
              <button className="btn btn-primary" autoFocus onClick={() => next('input')}>
                Get started
              </button>
              <button className="btn btn-ghost" onClick={() => onDone(false)}>
                Skip setup
              </button>
            </div>
          </>
        )}

        {step === 'input' && (
          <>
            <h2 id="setup-title">How will you play?</h2>
            <div className="choice-grid">
              <button className={`choice${method === 'midi' ? ' active' : ''}`} onClick={() => setMethod('midi')} aria-pressed={method === 'midi'}>
                <span className="choice-icon" aria-hidden>
                  🎹
                </span>
                <b>Digital piano / MIDI keyboard</b>
                <span className="muted small">Connected by USB. The best way to play.</span>
                {!midi.supported && <span className="warn-text small">This browser can't use MIDI — try Chrome or Edge.</span>}
              </button>
              <button className={`choice${method === 'keyboard' ? ' active' : ''}`} onClick={() => setMethod('keyboard')} aria-pressed={method === 'keyboard'}>
                <span className="choice-icon" aria-hidden>
                  ⌨️
                </span>
                <b>Computer keyboard</b>
                <span className="muted small">Try it now with A S D F G — no piano needed.</span>
              </button>
              <button className={`choice${method === 'mic' ? ' active' : ''}`} onClick={() => setMethod('mic')} aria-pressed={method === 'mic'}>
                <span className="choice-icon" aria-hidden>
                  🎤
                </span>
                <b>
                  Acoustic piano <span className="beta">beta</span>
                </b>
                <span className="muted small">Uses the microphone. One note at a time; headphones recommended.</span>
              </button>
            </div>
            <div className="overlay-actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (method === 'keyboard') onSettingsChange({ keyboardSimulator: true });
                  next(method === 'keyboard' ? 'keys' : 'connect');
                }}
                disabled={(method === 'midi' && !midi.supported) || (method === 'mic' && mic.status === 'unsupported')}
              >
                Continue
              </button>
            </div>
          </>
        )}

        {step === 'connect' && method === 'mic' && (
          <>
            <h2 id="setup-title">Listen to your piano</h2>
            <p className="muted">
              Place your device near the piano, allow the microphone, and play a note — you should see the meter move and the note name
              appear. Wear headphones while playing so the band doesn't reach the microphone.
            </p>
            <InputPanel midi={midi} mic={mic} keyboardSimulator={settings.keyboardSimulator} onKeyboardSimulatorChange={(v) => onSettingsChange({ keyboardSimulator: v })} />
            <div className="overlay-actions">
              <button className="btn btn-primary" onClick={() => next('keys')} disabled={mic.status !== 'listening'}>
                {mic.status === 'listening' ? 'Continue' : 'Waiting for the microphone…'}
              </button>
              <button className="btn btn-ghost" onClick={() => setStep('input')}>
                Back
              </button>
            </div>
          </>
        )}

        {step === 'connect' && method !== 'mic' && (
          <>
            <h2 id="setup-title">Connect your piano</h2>
            <p className="muted">Plug the piano into this computer with a USB cable (the "USB to Host" port) and switch it on.</p>
            <InputPanel midi={midi} keyboardSimulator={settings.keyboardSimulator} onKeyboardSimulatorChange={(v) => onSettingsChange({ keyboardSimulator: v })} />
            <div className="overlay-actions">
              <button className="btn btn-primary" onClick={() => next('keys')} disabled={!midi.listening}>
                {midi.listening ? 'Continue' : 'Waiting for your piano…'}
              </button>
              <button className="btn btn-ghost" onClick={() => setStep('input')}>
                Back
              </button>
            </div>
          </>
        )}

        {step === 'keys' && <FindKeys inputs={inputs} useBuiltInSound={method === 'keyboard'} onDone={() => next('sound')} />}

        {step === 'sound' && (
          <SoundStep
            method={method}
            settings={settings}
            onSettingsChange={onSettingsChange}
            onContinue={() => next('ready')}
          />
        )}

        {step === 'ready' && (
          <>
            <h2 id="setup-title">You're ready!</h2>
            <p className="muted">
              Level 1 is all about middle C — over a dance beat. Play the key as each tile touches the line. Later levels add one new
              key or skill at a time, and the 🔥 Hits tab has famous songs to play any time.
            </p>
            <p className="small muted">
              Optional: if hits feel early or late, calibrate your timing (30 seconds). You can also do it later in Settings.
            </p>
            <div className="overlay-actions">
              <button className="btn btn-primary" autoFocus onClick={() => onDone(true)}>
                ▶ Start Level 1
              </button>
              <button className="btn btn-secondary" onClick={onCalibrate}>
                Calibrate timing first
              </button>
              <button className="btn btn-ghost" onClick={() => onDone(false)}>
                Go to level select
              </button>
            </div>
          </>
        )}

        {step !== 'welcome' && step !== 'ready' && (
          <button className="link-btn" onClick={() => onDone(false)}>
            Skip setup
          </button>
        )}
      </section>
    </main>
  );
}

/** "Find your keys": play C D E F G in turn, with guidance after a wrong key. */
function FindKeys({ inputs, useBuiltInSound, onDone }: { inputs: readonly PianoInputSource[]; useBuiltInSound: boolean; onDone: () => void }) {
  const [found, setFound] = useState(0);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pressed, setPressed] = useState<number[]>([]);
  const target = TARGETS[found];

  useEffect(() => {
    keyboardSimulator.enable();
    let current = 0;
    const unsubs = inputs.map((input) =>
      input.subscribe((e) => {
        if (useBuiltInSound) {
          if (e.type === 'noteOn') audioEngine.pianoNoteOn(e.note, e.velocity);
          else audioEngine.pianoNoteOff(e.note);
        }
        setPressed((p) => (e.type === 'noteOn' ? [...p, e.note] : p.filter((n) => n !== e.note)));
        if (e.type !== 'noteOn' || current >= TARGETS.length) return;
        const fb = keyFeedback(TARGETS[current]!, e.note);
        if (fb.kind === 'correct') {
          current++;
          setFound(current);
          setMessage({ text: current === 1 ? 'That’s middle C — your home key!' : `Yes, ${midiToNoteName(e.note)}!`, ok: true });
        } else {
          setMessage({ text: fb.message, ok: false });
        }
      }),
    );
    return () => {
      unsubs.forEach((u) => u());
      keyboardSimulator.disable();
      audioEngine.pianoAllOff();
    };
  }, [inputs, useBuiltInSound]);

  const done = found >= TARGETS.length;
  return (
    <>
      <h2 id="setup-title">Find your keys</h2>
      <p className="muted">
        {done
          ? 'Perfect — those five keys are the five lanes of the game. Keep your right hand there: thumb on C, one finger per key.'
          : found === 0
            ? 'Middle C is the C closest to the centre of your piano — usually just left of the brand name. Put your right thumb on it and play it.'
            : `Now play ${midiToNoteName(target!)} — the next white key to the right, with the next finger.`}
      </p>
      <MiniKeyboard className="setup-keyboard" from={48} to={83} lanes={TARGETS.slice(0, Math.min(found + 1, 5))} pressed={pressed} />
      <div className="find-row" aria-live="polite">
        {TARGETS.map((m, i) => (
          <span key={m} className={`find-chip${i < found ? ' ok' : i === found ? ' now' : ''}`}>
            {midiToNoteName(m)}
          </span>
        ))}
      </div>
      {message && <p className={`msg ${message.ok ? 'ok' : 'warn'}`}>{message.text}</p>}
      <div className="overlay-actions">
        <button className="btn btn-primary" onClick={onDone} disabled={!done}>
          Continue
        </button>
      </div>
    </>
  );
}

function SoundStep({
  method,
  settings,
  onSettingsChange,
  onContinue,
}: {
  method: 'midi' | 'keyboard' | 'mic';
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onContinue: () => void;
}) {
  const [choice, setChoice] = useState<PianoOutput>(method === 'keyboard' ? 'virtual' : 'physical');

  function playChord() {
    audioEngine.unlock();
    audioEngine.setVolumes({ piano: settings.pianoVolume });
    [60, 64, 67].forEach((m) => audioEngine.pianoNoteOn(m, 90));
    setTimeout(() => audioEngine.pianoAllOff(), 900);
  }

  function playBand() {
    audioEngine.unlock();
    audioEngine.setVolumes({ backing: settings.backingVolume, metronome: 0 });
    const song = songFor(LEVELS[0]!);
    const spb = song.msPerBeat;
    const start = performance.now() + 150 + audioEngine.totalLatency * 1000;
    for (const n of arrange(song).filter((n) => n.beat >= 0 && n.beat < 8)) {
      audioEngine.playBacking(n, audioEngine.contextTimeFor(start + n.beat * spb), (n.durationBeats * spb) / 1000);
    }
  }

  return (
    <>
      <h2 id="setup-title">Sound</h2>
      <p className="muted">The game always plays a backing band — never your melody. Who should make the piano sound?</p>
      <div className="choice-grid two">
        <button className={`choice${choice === 'physical' ? ' active' : ''}`} onClick={() => setChoice('physical')} aria-pressed={choice === 'physical'}>
          <b>My piano</b>
          <span className="muted small">Your digital piano's own sound. Best feel, lowest latency.</span>
        </button>
        <button className={`choice${choice === 'virtual' ? ' active' : ''}`} onClick={() => setChoice('virtual')} aria-pressed={choice === 'virtual'}>
          <b>Built-in piano</b>
          <span className="muted small">The game plays a piano sound for your keys{method === 'midi' ? ' — turn your piano’s volume down' : ''}.</span>
        </button>
      </div>
      <div className="sound-tests">
        <button className="btn btn-secondary btn-small" onClick={playChord}>
          ▶ Built-in piano
        </button>
        <button className="btn btn-secondary btn-small" onClick={playBand}>
          ▶ Hear the band
        </button>
      </div>
      <div className="overlay-actions">
        <button
          className="btn btn-primary"
          onClick={() => {
            onSettingsChange({ pianoOutput: choice });
            audioEngine.stopBacking();
            onContinue();
          }}
        >
          Continue
        </button>
      </div>
    </>
  );
}
