import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Voice } from '../../audio-engine/synth';
import type { PianoInputSource } from '../../piano-input/types';
import { Looper, SLOT_COUNT, type ClipView, type LoopLength, type LooperSnapshot, type Snap } from '../../looper/Looper';
import { DRUM_CHANNEL, DRUM_LABEL, drumFor, INSTRUMENTS, instrumentInfo, partFor, type LoopInstrument } from '../../looper/instruments';
import { MiniKeyboard } from '../components/MiniKeyboard';
import { audioEngine } from '../inputs';
import type { Settings } from '../storage';
import { offsetFor } from '../calibrationKeys';

interface LooperScreenProps {
  inputs: readonly PianoInputSource[];
  settings: Settings;
  /** Name of the connected MIDI keyboard, if any. */
  deviceName: string | null;
  onBack: () => void;
  onSettings: () => void;
}

const STORE_KEY = 'piano-rush:looper:v1';
/** Schedule this far ahead of the audio (ms); the timer runs every TICK_MS. */
const LOOKAHEAD_MS = 160;
const TICK_MS = 25;
const LENGTHS: readonly LoopLength[] = [1, 2, 4, 8, 'free'];

function loadSnapshot(): Partial<LooperSnapshot> | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as LooperSnapshot) : null;
  } catch {
    return null;
  }
}

function saveSnapshot(s: LooperSnapshot): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: the session just isn't kept */
  }
}

/** Short drum names for the keys of the little keyboard. */
const DRUM_SHORT: Record<string, string> = { kick: 'K', snare: 'S', rim: 'R', clap: 'C', hat: 'H', openhat: 'O', tomlow: 'T1', tommid: 'T2', tomhigh: 'T3', crash: '✶' };

/**
 * Loop Studio: play your MIDI keyboard live and build music out of loops.
 * Pick an instrument, tap a slot to record a loop, then keep adding loops
 * and layers on top while everything plays in time.
 */
export function LooperScreen({ inputs, settings, deviceName, onBack, onSettings }: LooperScreenProps) {
  const looperRef = useRef<Looper | null>(null);
  if (!looperRef.current) {
    const l = new Looper();
    const saved = loadSnapshot();
    if (saved) l.restore(saved);
    looperRef.current = l;
  }
  const looper = looperRef.current;
  const [instrument, setInstrument] = useState<LoopInstrument>('drums');
  const instrumentRef = useRef(instrument);
  instrumentRef.current = instrument;
  const [, setFrame] = useState(0);
  const redraw = () => setFrame((f) => f + 1);
  const [pressed, setPressed] = useState<number[]>([]);
  const [bpmText, setBpmText] = useState<string | null>(null);
  const taps = useRef<number[]>([]);

  // Audio + input: live sound for your keys, and recording into the looper.
  useEffect(() => {
    audioEngine.unlock();
    audioEngine.setVolumes({ backing: settings.backingVolume, piano: settings.pianoVolume, metronome: settings.metronomeVolume });
    const offset = offsetFor(settings);
    const live = new Map<number, { instrument: LoopInstrument; voice: Voice | null }>();
    const offs = inputs.flatMap((input) => [
      input.subscribe((e) => {
        const time = e.time - offset;
        if (e.type === 'noteOn') {
          const inst: LoopInstrument = e.channel === DRUM_CHANNEL ? 'drums' : instrumentRef.current;
          live.get(e.note)?.voice?.stop(audioEngine.now, 0.05);
          let voice: Voice | null = null;
          if (inst === 'piano') audioEngine.pianoNoteOn(e.note, e.velocity);
          else {
            const { part, midi } = partFor(inst, e.note);
            voice = audioEngine.liveNote(part, midi, e.velocity / 127);
          }
          live.set(e.note, { instrument: inst, voice });
          looper.noteOn(e.note, e.velocity, time, inst);
          setPressed((p) => [...p.filter((n) => n !== e.note), e.note]);
        } else {
          const held = live.get(e.note);
          live.delete(e.note);
          if (held?.instrument === 'piano') audioEngine.pianoNoteOff(e.note);
          else held?.voice?.stop(audioEngine.now, 0.12);
          looper.noteOff(e.note, time);
          setPressed((p) => p.filter((n) => n !== e.note));
        }
      }),
      input.subscribePedal?.((p) => audioEngine.pianoSustain(p.down)) ?? (() => undefined),
    ]);

    // The scheduler: plays what's due a little ahead on the audio clock.
    let scheduledTo = performance.now();
    let frames = 0;
    let lastSaved = '';
    const timer = setInterval(() => {
      const now = performance.now();
      looper.update(now);
      if (looper.running) {
        const to = now + LOOKAHEAD_MS + audioEngine.totalLatency * 1000;
        const { notes, clicks } = looper.collect(Math.max(scheduledTo, now - 10), to);
        scheduledTo = to;
        for (const n of notes) {
          const { part, midi } = partFor(n.instrument, n.midi);
          audioEngine.playBacking({ part, beat: 0, durationBeats: 0, velocity: n.velocity / 127, midi }, audioEngine.contextTimeFor(n.timeMs), Math.max(0.05, n.durationMs / 1000));
        }
        for (const c of clicks) {
          audioEngine.playBacking({ part: 'click', beat: 0, durationBeats: 0, velocity: 1, accent: c.accent }, audioEngine.contextTimeFor(c.timeMs), 0.05);
        }
      } else {
        scheduledTo = now;
      }
      if (++frames % 2 === 0) redraw();
      if (frames % 80 === 0) {
        const json = JSON.stringify(looper.snapshot());
        if (json !== lastSaved) {
          saveSnapshot(looper.snapshot());
          lastSaved = json;
        }
      }
    }, TICK_MS);

    return () => {
      clearInterval(timer);
      offs.forEach((off) => off());
      for (const h of live.values()) h.voice?.stop(audioEngine.now, 0.1);
      audioEngine.pianoAllOff();
      audioEngine.stopBacking();
      saveSnapshot(looper.snapshot());
    };
    // Settings are read once per visit (volumes, input offset).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, looper]);

  const act = (fn: (now: number) => void) => {
    audioEngine.unlock();
    fn(performance.now());
    saveSnapshot(looper.snapshot());
    redraw();
  };
  const togglePlay = () =>
    act((now) => {
      if (looper.running) {
        looper.stop();
        audioEngine.stopBacking(0.05);
      } else looper.start(now);
    });
  const tapSlot = (i: number) => act((now) => looper.tap(i, now, instrumentRef.current));
  const setBpm = (bpm: number) => act((now) => looper.setBpm(bpm, now));
  const tapTempo = () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 2500), now].slice(-6);
    if (taps.current.length >= 3) {
      const gaps = taps.current.slice(1).map((t, i) => t - taps.current[i]!);
      setBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
    }
  };

  // Computer keys: 1–8 tap the slots, Enter plays / stops.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || (e.target as HTMLElement | null)?.closest('input, select, textarea')) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= SLOT_COUNT) {
        e.preventDefault();
        tapSlot(n - 1);
      } else if (e.key === 'Enter' && (e.target as HTMLElement | null)?.tagName !== 'BUTTON') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const now = performance.now();
  const views = looper.views(now);
  const pos = looper.position(now);
  const current = instrumentInfo(instrument);
  const recordingSlot = views.findIndex((v) => v.state === 'recording' || v.state === 'waiting');
  // Drums: label one octave (the kit repeats in every octave).
  const drumOctave = Array.from({ length: 12 }, (_, i) => 60 + i);
  const keyHints = instrument === 'drums' ? Object.fromEntries(drumOctave.map((m) => [m, DRUM_SHORT[drumFor(m)]!])) : {};

  return (
    <main className="screen looper-screen" style={{ '--world': current.color, '--world-shade': current.shade } as CSSProperties}>
      <header className="top-bar">
        <button className="btn btn-secondary back-btn" onClick={onBack}>
          ← Home
        </button>
        <h1 className="page-title">🔁 Loop Studio</h1>
        <button className={`input-chip${deviceName ? '' : ' warn'}`} onClick={onSettings} title="Connect your MIDI keyboard">
          <span aria-hidden>{deviceName ? '🎹' : settings.keyboardSimulator ? '⌨️' : '🔌'}</span>{' '}
          <span className="input-chip-text">{deviceName ?? (settings.keyboardSimulator ? 'Computer keys' : 'Connect a keyboard')}</span>
        </button>
      </header>

      <section className="transport" aria-label="Transport">
        <button className={`transport-play${looper.running ? ' on' : ''}`} onClick={togglePlay} aria-label={looper.running ? 'Stop' : 'Play'}>
          {looper.running ? '■' : '▶'}
        </button>
        <div className="beat-dots" aria-hidden>
          {Array.from({ length: looper.beatsPerBar }, (_, i) => (
            <span key={i} className={`beat-dot${pos && pos.beat === i + 1 ? ' on' : ''}${i === 0 ? ' first' : ''}${pos?.countIn ? ' count' : ''}`} />
          ))}
          <span className="bar-count">{pos ? (pos.countIn ? 'Get ready…' : `Bar ${pos.bar}`) : 'Stopped'}</span>
        </div>
        <div className="tempo">
          <button className="pill" onClick={() => setBpm(looper.bpm - 5)} aria-label="Slower">
            −
          </button>
          <label className="tempo-value">
            <input
              className="text"
              inputMode="numeric"
              value={bpmText ?? String(looper.bpm)}
              onChange={(e) => setBpmText(e.target.value)}
              onBlur={() => {
                const v = Number(bpmText);
                if (bpmText !== null && Number.isFinite(v) && v > 0) setBpm(v);
                setBpmText(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              aria-label="Tempo in beats per minute"
            />
            <span>BPM</span>
          </label>
          <button className="pill" onClick={() => setBpm(looper.bpm + 5)} aria-label="Faster">
            +
          </button>
          <button className="pill" onClick={tapTempo} title="Tap 3+ times in time to set the tempo">
            👆 Tap
          </button>
        </div>
        <button
          className={`pill${looper.metronome ? ' active' : ''}`}
          role="switch"
          aria-checked={looper.metronome}
          onClick={() => act(() => (looper.metronome = !looper.metronome))}
        >
          🥢 Click {looper.metronome ? 'ON' : 'OFF'}
        </button>
      </section>

      <section className="instrument-row" role="radiogroup" aria-label="Your keys play">
        {INSTRUMENTS.map((inst) => (
          <button
            key={inst.id}
            role="radio"
            aria-checked={instrument === inst.id}
            className={`instrument${instrument === inst.id ? ' active' : ''}`}
            style={{ '--world': inst.color, '--world-shade': inst.shade } as CSSProperties}
            onClick={() => setInstrument(inst.id)}
          >
            <span className="instrument-emoji" aria-hidden>
              {inst.emoji}
            </span>
            {inst.label}
          </button>
        ))}
      </section>

      <section className="slot-grid" aria-label="Loops">
        {views.map((v, i) => (
          <Slot
            key={i}
            index={i}
            view={v}
            instrument={instrument}
            onTap={() => tapSlot(i)}
            onOverdub={() => act((now) => looper.overdub(i, now))}
            onUndo={() => act(() => looper.undo(i))}
            onClear={() => act(() => looper.clear(i))}
          />
        ))}
      </section>

      <section className="looper-options">
        <div className="option-row" role="radiogroup" aria-label="Loop length">
          <span className="option-label">New loops</span>
          {LENGTHS.map((len) => (
            <button
              key={len}
              role="radio"
              aria-checked={looper.loopBars === len}
              className={`pill${looper.loopBars === len ? ' active' : ''}`}
              onClick={() => act(() => (looper.loopBars = len))}
            >
              {len === 'free' ? '∞ Free' : `${len} bar${len > 1 ? 's' : ''}`}
            </button>
          ))}
        </div>
        <div className="option-row">
          <span className="option-label">Snap</span>
          {(
            [
              [0.25, '1/16'],
              [0.5, '1/8'],
              [0, 'Off'],
            ] as Array<[Snap, string]>
          ).map(([s, label]) => (
            <button key={s} className={`pill${looper.snap === s ? ' active' : ''}`} onClick={() => act(() => (looper.snap = s))} aria-pressed={looper.snap === s}>
              {label}
            </button>
          ))}
          <button
            className="pill danger"
            onClick={() => {
              if (window.confirm('Clear all loops?')) act(() => looper.clearAll());
            }}
          >
            🗑 Clear all
          </button>
        </div>
      </section>

      <section className="looper-keys">
        <p className="looper-hint">
          {recordingSlot >= 0
            ? views[recordingSlot]!.state === 'waiting'
              ? `Get ready… recording starts in ${Math.max(1, Math.ceil(views[recordingSlot]!.startsIn))}`
              : `● Recording ${instrumentInfo(views[recordingSlot]!.instrument ?? instrument).label} — play now!`
            : instrument === 'drums'
              ? 'Drums: C kick · D snare · F♯ hi-hat · A♯ open hat · D♯ clap · F G A toms · B crash. Pads on channel 10 always play drums.'
              : `Your keys play ${current.label}. Tap an empty loop (or press 1–8) to record.`}
        </p>
        <MiniKeyboard className="looper-keyboard" from={48} to={84} pressed={pressed} lanes={instrument === 'drums' ? drumOctave : []} keyHints={keyHints} />
        {instrument === 'drums' && (
          <p className="drum-legend">
            {(['kick', 'snare', 'hat', 'openhat', 'clap', 'crash'] as const).map((d) => (
              <span key={d}>
                <b>{DRUM_SHORT[d]}</b> {DRUM_LABEL[d]}
              </span>
            ))}
          </p>
        )}
      </section>
    </main>
  );
}

function Slot({
  index,
  view,
  instrument,
  onTap,
  onOverdub,
  onUndo,
  onClear,
}: {
  index: number;
  view: ClipView;
  instrument: LoopInstrument;
  onTap: () => void;
  onOverdub: () => void;
  onUndo: () => void;
  onClear: () => void;
}) {
  const info = instrumentInfo(view.instrument ?? instrument);
  const label =
    view.state === 'empty'
      ? 'Tap to record'
      : view.state === 'waiting'
        ? `Starts in ${Math.max(1, Math.ceil(view.startsIn))}`
        : view.state === 'recording'
          ? view.overdubbing
            ? 'Adding…'
            : '● Rec'
          : view.state === 'muted'
            ? 'Muted'
            : view.overdubbing
              ? '● Adding'
              : `${view.bars} bar${view.bars === 1 ? '' : 's'}`;
  const progress = view.position ?? 0;
  return (
    <div className={`slot slot-${view.state}${view.overdubbing ? ' slot-dub' : ''}`} style={{ '--world': info.color, '--world-shade': info.shade } as CSSProperties}>
      <button
        className="slot-main"
        onClick={onTap}
        style={{ '--p': `${progress * 360}deg` } as CSSProperties}
        aria-label={`Loop ${index + 1}: ${view.state === 'empty' ? `record ${info.label}` : `${info.label}, ${view.state}`}`}
      >
        <span className="slot-num">{index + 1}</span>
        <span className="slot-emoji" aria-hidden>
          {view.state === 'empty' ? '⏺' : info.emoji}
        </span>
        <span className="slot-label">{label}</span>
      </button>
      {(view.state === 'playing' || view.state === 'muted') && (
        <div className="slot-tools">
          <button className={`slot-tool${view.overdubbing ? ' on' : ''}`} onClick={onOverdub} title="Add a layer (plays once round)" aria-label={`Add a layer to loop ${index + 1}`}>
            ➕
          </button>
          <button className="slot-tool" onClick={onUndo} title="Undo the last layer" aria-label={`Undo the last layer of loop ${index + 1}`}>
            ↶
          </button>
          <button className="slot-tool" onClick={onClear} title="Delete this loop" aria-label={`Delete loop ${index + 1}`}>
            🗑
          </button>
        </div>
      )}
    </div>
  );
}
