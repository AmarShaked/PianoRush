import type { PianoEvent } from '../piano-input/types';
import type { CompiledSong, TimedNote } from '../song-content/compile';
import { judgeOffset, resolveConfig, type EngineConfig, type EngineConfigInput, type Judgment } from './config';
import {
  emptyCounts,
  noteAccuracy,
  pointsFor,
  starsFor,
  timingAccuracy,
  type JudgmentCounts,
} from './scoring';
import { Transport } from './Transport';

export type GameState = 'ready' | 'countdown' | 'playing' | 'paused' | 'resuming' | 'finished';
export type NoteStatus = 'pending' | 'hit' | 'missed';

export interface NoteState extends TimedNote {
  status: NoteStatus;
  judgment: Judgment | null;
  /** Signed timing error in ms (positive = late). Null for misses. */
  offsetMs: number | null;
  /** Song time the judgment applies to (hit time, or window close for a miss). */
  judgedAt: number | null;
  /** Song time the key was released after a hit (visual only in M1). */
  releasedAt: number | null;
}

export type EngineEvent =
  | {
      readonly type: 'judgment';
      readonly note: Readonly<NoteState>;
      readonly judgment: Judgment;
      readonly offsetMs: number | null;
      readonly points: number;
      readonly combo: number;
      readonly score: number;
    }
  | { readonly type: 'wrongNote'; readonly midi: number; readonly lane: number | null; readonly songTime: number }
  | { readonly type: 'state'; readonly state: GameState; readonly previous: GameState };

export type EngineListener = (event: EngineEvent) => void;

export interface GameSnapshot {
  readonly state: GameState;
  /** ms relative to beat 0 (negative during count-in). */
  readonly songTime: number;
  readonly beat: number;
  /** 0..1 through the song. */
  readonly progress: number;
  readonly score: number;
  readonly combo: number;
  readonly maxCombo: number;
  readonly counts: Readonly<JudgmentCounts>;
  readonly wrongNotes: number;
  readonly notes: readonly Readonly<NoteState>[];
  readonly heldNotes: ReadonlySet<number>;
  /** Remaining ms of the post-resume countdown, when state === 'resuming'. */
  readonly resumeRemainingMs: number | null;
}

export interface GameResults {
  readonly songId: string;
  readonly score: number;
  readonly maxCombo: number;
  readonly counts: Readonly<JudgmentCounts>;
  readonly wrongNotes: number;
  readonly totalNotes: number;
  readonly noteAccuracy: number;
  readonly timingAccuracy: number;
  readonly stars: 1 | 2 | 3;
  /** Average signed offset of hits (positive = tends to play late). */
  readonly meanOffsetMs: number | null;
}

export interface HitResult {
  readonly note: Readonly<NoteState>;
  readonly judgment: Judgment;
  readonly offsetMs: number;
}

/**
 * Pure game logic: timeline, matching, judgments, score/combo, state machine.
 *
 * No React, PixiJS, DOM or audio dependencies. All time arrives as explicit
 * clock timestamps (ms, monotonic — the same base as PianoEvent.time), so the
 * engine is deterministic and independent of frame rate: `update()` may be
 * called at any cadence and scoring is decided by input timestamps alone.
 */
export class GameEngine {
  readonly config: EngineConfig;
  readonly song: CompiledSong;

  private readonly transport: Transport;
  private notes: NoteState[] = [];
  private state: GameState = 'ready';
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private counts: JudgmentCounts = emptyCounts();
  private wrongNotes = 0;
  private offsetSum = 0;
  private hitCount = 0;
  /** Index of the first note that may still be pending (all before are judged). */
  private cursor = 0;
  private readonly held = new Map<number, number>(); // midi → clock time of noteOn
  private readonly listeners = new Set<EngineListener>();
  private lastClock = 0;

  constructor(song: CompiledSong, config: EngineConfigInput = {}) {
    this.song = song;
    this.config = resolveConfig(config);
    this.transport = new Transport(song.countInMs);
    this.resetNotes();
  }

  // ---- lifecycle ------------------------------------------------------

  get currentState(): GameState {
    return this.state;
  }

  /** Song time at which the level is considered finished. */
  get endSongTime(): number {
    const last = this.song.notes[this.song.notes.length - 1];
    const lastMissDeadline = last ? last.timeMs + this.config.windows.good + this.config.missGraceMs : 0;
    return Math.max(this.song.endMs + this.config.endTailMs, lastMissDeadline);
  }

  on(listener: EngineListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Begin the count-in at `clock`. Only valid from the `ready` state. */
  start(clock: number): void {
    if (this.state !== 'ready') return;
    this.transport.start(clock);
    this.lastClock = clock;
    this.setState(this.transport.songTime(clock) < 0 ? 'countdown' : 'playing');
  }

  pause(clock: number): void {
    if (this.state !== 'countdown' && this.state !== 'playing' && this.state !== 'resuming') return;
    // Settle everything that happened up to the pause moment (independent of frame timing).
    this.update(clock);
    if (this.currentState === 'finished') return;
    this.transport.pause(clock);
    this.setState('paused');
  }

  /** Resume after a frozen countdown of `resumeCountdownBeats` (skipped during the count-in). */
  resume(clock: number): void {
    if (this.state !== 'paused') return;
    const inCountIn = this.transport.songTime(clock) < 0;
    const delay = inCountIn ? 0 : this.config.resumeCountdownBeats * this.song.msPerBeat;
    this.transport.resume(clock, delay);
    this.setState('resuming');
    this.update(clock);
  }

  /** Reset everything to `ready` without touching physical held-key state. */
  restart(): void {
    this.transport.reset();
    this.resetNotes();
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.counts = emptyCounts();
    this.wrongNotes = 0;
    this.offsetSum = 0;
    this.hitCount = 0;
    this.setState('ready');
  }

  /** Advance to `clock`: state transitions, miss detection, completion. Safe at any rate. */
  update(clock: number): void {
    this.lastClock = Math.max(this.lastClock, clock);
    if (this.state === 'ready' || this.state === 'finished') return;

    if (this.transport.isPausedAt(clock)) {
      if (this.state === 'resuming' && this.transport.pendingResumeAt(clock) === null) this.setState('paused');
      return;
    }

    const songTime = this.transport.songTime(clock);
    this.declareMissesBefore(songTime - this.config.missGraceMs);
    this.setState(songTime < 0 ? 'countdown' : 'playing');

    if (this.cursor >= this.notes.length && songTime >= this.endSongTime) {
      this.setState('finished');
    }
  }

  // ---- input ------------------------------------------------------------

  /**
   * Feed a normalized input event. Returns the hit it produced, if any.
   * Judgment uses the event's own timestamp, not the time it was processed.
   */
  handleInput(event: PianoEvent): HitResult | null {
    if (event.type === 'noteOff') {
      if (!this.held.has(event.note)) return null;
      this.held.delete(event.note);
      if (this.isActiveAt(event.time)) this.markRelease(event.note, this.songTimeOfInput(event.time));
      return null;
    }

    const prevOn = this.held.get(event.note);
    if (prevOn !== undefined && event.time - prevOn < this.config.duplicateWindowMs) return null; // duplicate
    this.held.set(event.note, event.time);

    if (!this.isActiveAt(event.time)) return null;

    const songTime = this.songTimeOfInput(event.time);
    this.declareMissesBefore(songTime);

    const note = this.findCandidate(event.note, songTime);
    if (!note) {
      // Warming up on the keys during the count-in is not a mistake.
      if (songTime >= 0) this.registerWrongNote(event.note, songTime);
      return null;
    }
    const offsetMs = songTime - note.timeMs;
    const judgment = judgeOffset(offsetMs, this.config.windows);
    this.applyJudgment(note, judgment, offsetMs, songTime);
    return { note, judgment, offsetMs };
  }

  // ---- queries ------------------------------------------------------------

  songTimeAt(clock: number): number {
    return this.transport.isStarted ? this.transport.songTime(clock) : -this.song.countInMs;
  }

  getSnapshot(clock: number): GameSnapshot {
    const songTime = this.songTimeAt(clock);
    const resumeAt = this.state === 'resuming' ? this.transport.pendingResumeAt(clock) : null;
    return {
      state: this.state,
      songTime,
      beat: songTime / this.song.msPerBeat,
      progress: Math.min(1, Math.max(0, songTime / this.song.endMs)),
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      counts: this.counts,
      wrongNotes: this.wrongNotes,
      notes: this.notes,
      heldNotes: new Set(this.held.keys()),
      resumeRemainingMs: resumeAt === null ? null : resumeAt - clock,
    };
  }

  getResults(): GameResults {
    const acc = noteAccuracy(this.counts);
    return {
      songId: this.song.definition.id,
      score: this.score,
      maxCombo: this.maxCombo,
      counts: { ...this.counts },
      wrongNotes: this.wrongNotes,
      totalNotes: this.notes.length,
      noteAccuracy: acc,
      timingAccuracy: timingAccuracy(this.counts),
      stars: starsFor(acc),
      meanOffsetMs: this.hitCount === 0 ? null : this.offsetSum / this.hitCount,
    };
  }

  // ---- internals ------------------------------------------------------------

  private resetNotes(): void {
    this.notes = this.song.notes.map((n) => ({
      ...n,
      status: 'pending',
      judgment: null,
      offsetMs: null,
      judgedAt: null,
      releasedAt: null,
    }));
    this.cursor = 0;
  }

  private isActiveAt(clock: number): boolean {
    return this.state !== 'ready' && this.state !== 'finished' && this.transport.isRunningAt(clock);
  }

  private songTimeOfInput(clock: number): number {
    return this.transport.songTime(clock) - this.config.inputOffsetMs;
  }

  /** Earliest pending note of this pitch whose Good window contains `songTime`. */
  private findCandidate(midi: number, songTime: number): NoteState | null {
    const window = this.config.windows.good;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i]!;
      if (n.timeMs - window > songTime) break; // sorted by time: nothing later can match
      if (n.status === 'pending' && n.midi === midi && Math.abs(songTime - n.timeMs) <= window) return n;
    }
    return null;
  }

  /** Miss every pending note whose Good window closed strictly before `songTime`. */
  private declareMissesBefore(songTime: number): void {
    const window = this.config.windows.good;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i]!;
      if (n.timeMs + window >= songTime) break;
      if (n.status === 'pending') this.applyJudgment(n, 'miss', null, n.timeMs + window);
    }
    this.advanceCursor();
  }

  private advanceCursor(): void {
    while (this.cursor < this.notes.length && this.notes[this.cursor]!.status !== 'pending') this.cursor++;
  }

  private applyJudgment(note: NoteState, judgment: Judgment, offsetMs: number | null, songTime: number): void {
    if (note.status !== 'pending') return; // each note is scored at most once
    note.status = judgment === 'miss' ? 'missed' : 'hit';
    note.judgment = judgment;
    note.offsetMs = offsetMs;
    note.judgedAt = songTime;
    this.counts[judgment]++;

    let points = 0;
    if (judgment === 'miss') {
      this.combo = 0;
    } else {
      points = pointsFor(judgment, this.combo, this.config.scoring);
      this.score += points;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.offsetSum += offsetMs ?? 0;
      this.hitCount++;
    }
    this.advanceCursor();
    this.emit({ type: 'judgment', note, judgment, offsetMs, points, combo: this.combo, score: this.score });
  }

  private registerWrongNote(midi: number, songTime: number): void {
    this.wrongNotes++;
    if (this.config.wrongNoteBreaksCombo) this.combo = 0;
    const lane = this.song.definition.lanes.indexOf(midi);
    this.emit({ type: 'wrongNote', midi, lane: lane >= 0 ? lane : null, songTime });
  }

  private markRelease(midi: number, songTime: number): void {
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const n = this.notes[i]!;
      if (n.midi === midi && n.status === 'hit' && n.releasedAt === null) {
        n.releasedAt = songTime;
        return;
      }
    }
  }

  private setState(next: GameState): void {
    if (next === this.state) return;
    const previous = this.state;
    this.state = next;
    this.emit({ type: 'state', state: next, previous });
  }

  private emit(event: EngineEvent): void {
    for (const l of [...this.listeners]) l(event);
  }
}
