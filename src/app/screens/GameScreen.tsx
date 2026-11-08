import { useEffect, useRef, useState } from 'react';
import type { GameResults, GameState } from '../../game-engine/GameEngine';
import type { GameRenderer, LaneInfo } from '../../game-renderer/GameRenderer';
import { DEFAULT_KEY_MAP, keyLabel } from '../../piano-input/KeyboardSimulator';
import { isBlackKey, MIDDLE_C, midiToNoteName, midiToPitchClass } from '../../piano-input/noteNames';
import type { PianoInputSource } from '../../piano-input/types';
import type { CompiledSong } from '../../song-content/compile';
import type { GameMode, LevelDefinition } from '../../song-content/level';
import { BackingPlayer } from '../../audio-engine/BackingPlayer';
import { GameSession, type SessionNotice } from '../GameSession';
import { audioEngine } from '../inputs';
import { CHALLENGE_WINDOWS, TIMING_PRESETS, type Settings } from '../storage';

export const MODE_LABEL: Record<GameMode, string> = { discover: 'Discover', flow: 'Flow', challenge: 'Challenge' };

interface GameScreenProps {
  level: LevelDefinition;
  song: CompiledSong;
  mode: GameMode;
  /** Practice speed (1 = full tempo). */
  speed: number;
  inputs: readonly PianoInputSource[];
  settings: Settings;
  /** Play the built-in piano for the player's keys (virtual piano mode). */
  virtualPiano: boolean;
  onFinished: (results: GameResults) => void;
  onQuit: () => void;
}

const KEY_HINTS = new Map(Object.entries(DEFAULT_KEY_MAP).map(([code, note]) => [note, keyLabel(code)]));
const HUD_HEIGHT = 64;
/** `?debug` in the URL shows an FPS / timing readout for real-device testing. */
const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

/** Lead time before the count-in so the first click can be queued on time (plus device latency). */
const startDelayMs = () => 250 + audioEngine.totalLatency * 1000;

export function GameScreen({ level, song, mode, speed, inputs, settings, virtualPiano, onFinished, onQuit }: GameScreenProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const comboRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const debugRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<GameSession | null>(null);
  const [state, setState] = useState<GameState>('ready');
  const [notice, setNotice] = useState<SessionNotice | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep the latest callbacks without re-running the setup effect.
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const def = song.definition;
    const session = new GameSession({
      song,
      inputs,
      engineConfig: {
        windows: mode === 'challenge' ? CHALLENGE_WINDOWS : TIMING_PRESETS[settings.timingPreset].windows,
        inputOffsetMs: settings.inputOffsetMs,
        waitForNotes: mode === 'discover',
      },
    });
    sessionRef.current = session;
    // Dev-only hook for automated browser tests (stripped from production builds).
    if (import.meta.env.DEV) (window as unknown as { __pianoRush?: GameSession }).__pianoRush = session;
    let renderer: GameRenderer | null = null;
    let cancelled = false;
    let finishTimer: number | undefined;

    // Lane info from the song: spelling, black keys, which hand plays each lane
    // (majority of its notes), finger guidance and a landmark for low C.
    const handOf = (midi: number) => {
      const ns = def.notes.filter((n) => n.midi === midi);
      return ns.filter((n) => n.hand === 'left').length > ns.length / 2 ? ('left' as const) : ('right' as const);
    };
    const lanes: LaneInfo[] = def.lanes.map((midi, i) => ({
      midi,
      noteName: midiToNoteName(midi, def.preferFlats),
      pitchClass: midiToPitchClass(midi, def.preferFlats),
      keyHint: settings.keyboardSimulator ? KEY_HINTS.get(midi) : undefined,
      isMiddleC: midi === MIDDLE_C,
      isBlack: isBlackKey(midi),
      hand: handOf(midi),
      finger: settings.showFingers ? (def.fingers?.[i] ?? undefined) : undefined,
      badge: midi === 48 && !def.lanes.includes(MIDDLE_C) ? 'LOW C' : undefined,
    }));

    const offEngine = session.engine.on((e) => {
      if (e.type === 'note') renderer?.triggerNote(e.note.lane, e.judgment);
      else if (e.type === 'judgment') renderer?.showJudgment(e.judgment, e.offsetMs, e.event.partial);
      else if (e.type === 'hold') renderer?.triggerHold(e.note.lane, e.result);
      else if (e.type === 'wrongNote') renderer?.triggerWrongNote(e.lane);
      else if (e.type === 'state') {
        setState(e.state);
        if (e.state === 'finished') {
          finishTimer = window.setTimeout(() => onFinishedRef.current(session.engine.getResults()), 1100);
        } else {
          window.clearTimeout(finishTimer);
        }
      }
    });
    const offNotice = session.onNotice(setNotice);

    // Audio: accompaniment follows the engine's song time; the built-in piano plays the player's keys.
    audioEngine.setVolumes({ backing: settings.backingVolume, piano: settings.pianoVolume, metronome: settings.metronomeVolume });
    const backing = new BackingPlayer(audioEngine, session.engine, song, () => performance.now(), { metronome: settings.metronome });
    const offPiano = virtualPiano
      ? inputs.map((input) =>
          input.subscribe((e) => (e.type === 'noteOn' ? audioEngine.pianoNoteOn(e.note, e.velocity) : audioEngine.pianoNoteOff(e.note))),
        )
      : [];

    // HUD is updated directly (no React re-render per frame).
    let lastScore = -1;
    let lastCombo = -1;
    let lastProgress = -1;
    let fpsFrames = 0;
    let fpsSince = performance.now();
    const frame = () => {
      const snap = session.frame();
      if (DEBUG && debugRef.current) {
        fpsFrames++;
        const now = performance.now();
        if (now - fpsSince >= 500) {
          const fps = (fpsFrames * 1000) / (now - fpsSince);
          debugRef.current.textContent = `${fps.toFixed(0)} FPS · ${snap.state} · t=${(snap.songTime / 1000).toFixed(2)}s · beat ${snap.beat.toFixed(2)}`;
          fpsFrames = 0;
          fpsSince = now;
        }
      }
      if (snap.score !== lastScore && scoreRef.current) scoreRef.current.textContent = snap.score.toLocaleString();
      if (snap.combo !== lastCombo && comboRef.current) comboRef.current.textContent = `${snap.combo}×`;
      const p = Math.round(snap.progress * 1000) / 10;
      if (p !== lastProgress && progressRef.current) progressRef.current.style.width = `${p}%`;
      lastScore = snap.score;
      lastCombo = snap.combo;
      lastProgress = p;
      return snap;
    };

    // PixiJS is loaded on demand so the menus open instantly.
    import('../../game-renderer/GameRenderer')
      .then(({ GameRenderer }) =>
        GameRenderer.create(host, {
      lanes,
      msPerBeat: song.msPerBeat,
      totalBeats: song.totalBeats,
      countInBeats: def.countInBeats,
      beatsPerBar: def.timeSignature[0],
      reducedMotion: settings.reducedMotion,
      showKeyHints: settings.keyboardSimulator && settings.showKeyHints,
      showTileLabels: settings.showNoteLabels,
      topInset: HUD_HEIGHT,
        }),
      )
      .then((r) => {
        if (cancelled) {
          r.destroy();
          return;
        }
        renderer = r;
        if (import.meta.env.DEV) (window as unknown as { __pianoRushRenderer?: GameRenderer }).__pianoRushRenderer = r;
        r.setFrameSource(frame);
        backing.start();
        session.start(startDelayMs());
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        const st = session.engine.currentState;
        if (st === 'paused') session.resume();
        else if (st !== 'finished' && st !== 'ready') session.pause();
      } else if (e.code === 'KeyR' && session.engine.currentState === 'paused') {
        setNotice(null);
        session.restart(startDelayMs());
      }
    };
    const onVisibility = () => {
      if (document.hidden) session.pause();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(finishTimer);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      offEngine();
      offNotice();
      backing.dispose();
      offPiano.forEach((off) => off());
      audioEngine.pianoAllOff();
      session.dispose();
      renderer?.destroy();
      sessionRef.current = null;
    };
  }, [song, mode, inputs, settings, virtualPiano]);

  const session = sessionRef.current;
  const paused = state === 'paused';

  return (
    <main className="screen game-screen">
      <div className="game-host" ref={hostRef} />

      <header className="hud" style={{ height: HUD_HEIGHT }}>
        <div className="hud-left">
          <div className="hud-title">
            <span className={`mode-badge mode-${mode}`}>{MODE_LABEL[mode]}</span>
            {speed < 1 && <span className="mode-badge speed-badge">{Math.round(speed * 100)}%</span>}
            {level.world > 0 ? `${level.number}. ` : ''}
            {level.title}
          </div>
          <div className="progress" role="progressbar" aria-label="Level progress">
            <div className="progress-fill" ref={progressRef} />
          </div>
        </div>
        <div className="hud-center">
          <span className="hud-label">Score</span>
          <span className="hud-score" ref={scoreRef}>
            0
          </span>
        </div>
        <div className="hud-right">
          <div className="hud-combo">
            <span className="hud-label">Combo</span>
            <span ref={comboRef}>0×</span>
          </div>
          <button
            className="icon-btn"
            onClick={() => session?.togglePause()}
            aria-label={paused ? 'Resume' : 'Pause'}
            disabled={state === 'finished' || state === 'ready'}
          >
            {paused ? '▶' : '❚❚'}
          </button>
        </div>
      </header>
      {DEBUG && <div className="debug-readout" ref={debugRef} />}

      {error && (
        <div className="overlay">
          <div className="card overlay-card" role="alert">
            <h2>Graphics could not start</h2>
            <p className="muted">{error}</p>
            <p className="small muted">Piano Rush needs WebGL or WebGPU. Try enabling hardware acceleration or another browser.</p>
            <button className="btn btn-primary" onClick={onQuit}>
              Back to menu
            </button>
          </div>
        </div>
      )}

      {paused && (
        <div className="overlay">
          <div className="card overlay-card" role="dialog" aria-modal="true" aria-labelledby="pause-title">
            <h2 id="pause-title">Paused</h2>
            <p className="muted small">
              {level.title} · {MODE_LABEL[mode]}
            </p>
            {notice?.type === 'device-disconnected' && (
              <div className="notice warn" role="alert">
                <strong>“{notice.deviceName}” disconnected.</strong>
                <p>Reconnect your piano (check the USB cable and power), then resume.</p>
              </div>
            )}
            {notice?.type === 'device-reconnected' && (
              <div className="notice ok" role="status">
                <strong>“{notice.deviceName}” reconnected.</strong> Ready when you are.
              </div>
            )}
            <div className="overlay-actions">
              <button className="btn btn-primary" autoFocus onClick={() => session?.resume()}>
                Resume
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setNotice(null);
                  session?.restart(startDelayMs());
                }}
              >
                Restart
              </button>
              <button className="btn btn-ghost" onClick={onQuit}>
                Quit to menu
              </button>
            </div>
            <p className="small muted">Esc: resume · R: restart</p>
          </div>
        </div>
      )}
    </main>
  );
}
