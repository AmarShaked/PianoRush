import type { GameEngine } from '../game-engine/GameEngine';
import { chordAt, parseChord } from '../song-content/chords';
import type { CompiledSong } from '../song-content/compile';
import { arrange, padVoicing, type BackingNote } from './arranger';
import type { AudioEngine } from './AudioEngine';
import { notesInWindow, notesSoundingAt } from './schedule';

export interface BackingPlayerOptions {
  readonly metronome?: boolean;
  /** Extra scheduling lookahead on top of the device latency (ms). */
  readonly lookaheadMs?: number;
  /** Timer period for the scheduler (ms). Only decides *when we queue*, not when notes sound. */
  readonly tickMs?: number;
}

/**
 * Plays a song's accompaniment in sync with a GameEngine.
 *
 * Musical time comes from the engine's transport (the same song time that
 * positions tiles and judges input). A short timer looks ahead and queues
 * notes on the AudioContext at exact context times (via the AudioEngine's
 * clock mapping), so audio is sample-accurate regardless of timer jitter or
 * frame rate. Any discontinuity — pause, Discover wait, restart, finish —
 * stops queued audio; playback resumes from the current song position.
 */
export class BackingPlayer {
  private readonly notes: BackingNote[];
  private scheduledUntilBeat: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopSustain: (() => void) | null = null;
  private lastState: string | null = null;

  constructor(
    private readonly audio: AudioEngine,
    private readonly game: GameEngine,
    private readonly song: CompiledSong,
    private readonly now: () => number = () => performance.now(),
    private readonly options: BackingPlayerOptions = {},
  ) {
    this.notes = arrange(song, { metronome: options.metronome });
  }

  start(): void {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), this.options.tickMs ?? 25);
  }

  tick(): void {
    if (!this.audio.isRunning) return;
    const state = this.game.currentState;
    const running = state === 'countdown' || state === 'playing';

    if (state !== this.lastState) {
      this.onStateChange(state);
      this.lastState = state;
    }
    if (!running) return;

    const now = this.now();
    const msPerBeat = this.song.msPerBeat;
    const songNow = this.game.songTimeAt(now);
    const beatNow = songNow / msPerBeat;
    if (this.scheduledUntilBeat === null) {
      // (Re)start: include notes that fell due in the last ~80 ms (e.g. the downbeat
      // a Discover wait resumed on) and re-enter any chord that is still sounding.
      const from = beatNow - 80 / msPerBeat;
      // These are due "now" by construction, so they play immediately rather than being dropped as late.
      if (beatNow > 0) for (const n of notesSoundingAt(this.notes, beatNow)) this.queue(n, now, songNow, Infinity);
      for (const n of notesInWindow(this.notes, from, beatNow)) this.queue(n, now, songNow, Infinity);
      this.scheduledUntilBeat = beatNow;
    }
    const lookahead = (this.options.lookaheadMs ?? 120) + this.audio.totalLatency * 1000;
    const toBeat = (songNow + lookahead) / msPerBeat;
    for (const n of notesInWindow(this.notes, this.scheduledUntilBeat, toBeat)) this.queue(n, now, songNow);
    this.scheduledUntilBeat = toBeat;
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stopSustain?.();
    this.stopSustain = null;
    this.audio.stopBacking(0.05);
  }

  private queue(n: BackingNote, now: number, songNow: number, maxLateSec?: number): void {
    const msPerBeat = this.song.msPerBeat;
    const audibleAt = now + (n.beat * msPerBeat - songNow);
    this.audio.playBacking(n, this.audio.contextTimeFor(audibleAt), (n.durationBeats * msPerBeat) / 1000, maxLateSec);
  }

  private onStateChange(state: string): void {
    this.stopSustain?.();
    this.stopSustain = null;
    if (state === 'countdown' || state === 'playing') return; // (re)start from the current position on next tick
    this.audio.stopBacking(state === 'finished' ? 1.2 : 0.08);
    this.scheduledUntilBeat = null;
    if (state === 'waiting' && this.song.definition.backing) {
      // Discover: keep the current harmony softly in the air while the song waits.
      const beat = this.game.songTimeAt(this.now()) / this.song.msPerBeat;
      const chord = parseChord(chordAt(this.song.definition.backing.chords, Math.max(0, beat)) ?? 'C');
      if (chord) this.stopSustain = this.audio.sustainChord(padVoicing(chord));
    }
  }
}
