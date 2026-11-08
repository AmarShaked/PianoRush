import type { PianoEvent } from '../piano-input/types';
import type { CompiledSong, TimedNote } from '../song-content/compile';
import {
  downgradeJudgment,
  judgeOffset,
  resolveConfig,
  worstJudgment,
  type EngineConfig,
  type EngineConfigInput,
  type HitJudgment,
  type Judgment,
} from './config';
import { comboMultiplier, emptyCounts, noteAccuracy, pointsFor, timingAccuracy, type JudgmentCounts } from './scoring';
import { Transport } from './Transport';

export type GameState = 'ready' | 'countdown' | 'playing' | 'waiting' | 'paused' | 'resuming' | 'finished';
export type NoteStatus = 'pending' | 'hit' | 'missed';
/** Hold-note lifecycle after the key went down: `holding` until released or the note ends. */
export type HoldStatus = 'none' | 'holding' | 'full' | 'early';

export interface NoteState extends TimedNote {
  status: NoteStatus;
  judgment: Judgment | null;
  /** Signed timing error in ms (positive = late). Null for misses. */
  offsetMs: number | null;
  /** Song time the judgment applies to (hit time, or window close for a miss). */
  judgedAt: number | null;
  /** Song time the key was released after a hit. */
  releasedAt: number | null;
  hold: HoldStatus;
}

/** A musical event (single note or chord) — the unit of scoring, combo and accuracy. */
export interface EventState {
  readonly id: number;
  readonly timeMs: number;
  readonly notes: readonly NoteState[];
  resolved: boolean;
  judgment: Judgment | null;
  /** A chord where some, but not all, keys were played. */
  partial: boolean;
  points: number;
}

export type EngineEvent =
  /** One key of an event was judged (drives per-lane effects). */
  | { readonly type: 'note'; readonly note: Readonly<NoteState>; readonly judgment: Judgment; readonly offsetMs: number | null }
  /** A whole event (note or chord) resolved: scoring, combo. */
  | {
      readonly type: 'judgment';
      readonly event: Readonly<EventState>;
      readonly judgment: Judgment;
      /** Mean offset of the keys that were hit, or null. */
      readonly offsetMs: number | null;
      readonly points: number;
      readonly combo: number;
      readonly score: number;
    }
  | { readonly type: 'hold'; readonly note: Readonly<NoteState>; readonly result: 'full' | 'early'; readonly points: number }
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
  /** Discover mode: pitches still needed to continue, when state === 'waiting'. */
  readonly waitingFor: readonly number[];
}

export interface GameResults {
  readonly songId: string;
  readonly score: number;
  readonly maxCombo: number;
  /** Per musical event (a chord counts once). */
  readonly counts: Readonly<JudgmentCounts>;
  readonly wrongNotes: number;
  readonly totalNotes: number;
  readonly totalEvents: number;
  /** Events played correctly (any hit judgment) / all events. */
  readonly noteAccuracy: number;
  /** Timing quality weighted by judgment. */
  readonly timingAccuracy: number;
  /** Average signed offset of hit keys (positive = tends to play late). */
  readonly meanOffsetMs: number | null;
  readonly holds: { readonly total: number; readonly full: number };
  readonly partialChords: number;
}

export interface HitResult {
  readonly note: Readonly<NoteState>;
  readonly judgment: Judgment;
  readonly offsetMs: number;
}

/**
 * Pure game logic: timeline, matching, judgments, score/combo, holds, chords,
 * Discover-mode waiting and the state machine.
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
  private events: EventState[] = [];
  private state: GameState = 'ready';
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private counts: JudgmentCounts = emptyCounts();
  private wrongNotes = 0;
  private offsetSum = 0;
  private hitCount = 0;
  private holdsFull = 0;
  private partialChords = 0;
  /** Index of the first note that may still be pending. */
  private cursor = 0;
  /** Index of the first event that is not yet resolved. */
  private eventCursor = 0;
  private readonly holding = new Set<NoteState>();
  private waitingEvent: EventState | null = null;
  private readonly held = new Map<number, number>(); // midi → clock time of noteOn
  private readonly listeners = new Set<EngineListener>();

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
    this.setState(this.transport.songTime(clock) < 0 ? 'countdown' : 'playing');
    this.update(clock);
  }

  pause(clock: number): void {
    if (!this.isRunningState()) return;
    // Settle everything that happened up to the pause moment (independent of frame timing).
    this.update(clock);
    if (!this.isRunningState()) return;
    // Holds can't be expected to survive a pause menu: credit them.
    for (const note of [...this.holding]) this.finishHold(note, 'full');
    this.transport.pause(clock, 'user');
    this.setState('paused');
  }

  /** Resume after a frozen countdown of `resumeCountdownBeats` (skipped in the count-in or while waiting). */
  resume(clock: number): void {
    if (this.state !== 'paused') return;
    const skipCountdown = this.transport.songTime(clock) < 0 || this.waitingEvent !== null;
    const delay = skipCountdown ? 0 : this.config.resumeCountdownBeats * this.song.msPerBeat;
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
    this.holdsFull = 0;
    this.partialChords = 0;
    this.holding.clear();
    this.waitingEvent = null;
    this.setState('ready');
  }

  /** Advance to `clock`: state transitions, holds, waits, misses, completion. Safe at any rate. */
  update(clock: number): void {
    if (this.state === 'ready' || this.state === 'finished') return;

    if (this.transport.isUserPausedAt(clock)) {
      if (this.state === 'resuming' && this.transport.pendingResumeAt(clock) === null) this.setState('paused');
      return;
    }
    if (this.transport.isWaitingAt(clock)) {
      this.setState('waiting');
      return;
    }

    const songTime = this.transport.songTime(clock);
    this.resolveHoldsUntil(songTime);
    if (this.config.waitForNotes && this.beginWaitIfDue(clock, songTime)) return;
    this.declareMissesBefore(songTime - this.config.missGraceMs);
    this.setState(songTime < 0 ? 'countdown' : 'playing');

    if (this.eventCursor >= this.events.length && this.holding.size === 0 && songTime >= this.endSongTime) {
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
    if (prevOn !== undefined) this.markRelease(event.note, this.songTimeOfInput(event.time)); // lost noteOff

    if (this.config.waitForNotes && !this.transport.isPausedAt(event.time)) {
      // A wait may be due before this press (e.g. no frame ran in between).
      this.beginWaitIfDue(event.time, this.transport.songTime(event.time));
    }

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
    this.applyNoteJudgment(note, judgment, offsetMs, songTime);

    const waiting = this.waitingEvent;
    if (waiting && waiting.resolved) {
      this.waitingEvent = null;
      this.transport.resume(event.time, 0);
      this.setState('playing');
    }
    return { note, judgment, offsetMs };
  }

  // ---- queries ------------------------------------------------------------

  songTimeAt(clock: number): number {
    return this.transport.isStarted ? this.transport.songTime(clock) : -this.song.countInMs;
  }

  getSnapshot(clock: number): GameSnapshot {
    const songTime = this.songTimeAt(clock);
    const resumeAt = this.state === 'resuming' ? this.transport.pendingResumeAt(clock) : null;
    const waitingFor =
      this.waitingEvent && (this.state === 'waiting' || this.state === 'paused' || this.state === 'resuming')
        ? this.waitingEvent.notes.filter((n) => n.status === 'pending').map((n) => n.midi)
        : [];
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
      waitingFor,
    };
  }

  getResults(): GameResults {
    return {
      songId: this.song.definition.id,
      score: this.score,
      maxCombo: this.maxCombo,
      counts: { ...this.counts },
      wrongNotes: this.wrongNotes,
      totalNotes: this.notes.length,
      totalEvents: this.events.length,
      noteAccuracy: noteAccuracy(this.counts),
      timingAccuracy: timingAccuracy(this.counts),
      meanOffsetMs: this.hitCount === 0 ? null : this.offsetSum / this.hitCount,
      holds: { total: this.song.holdCount, full: this.holdsFull },
      partialChords: this.partialChords,
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
      hold: 'none',
    }));
    this.events = this.song.events.map((e) => ({
      id: e.id,
      timeMs: e.timeMs,
      notes: e.noteIds.map((id) => this.notes[id]!),
      resolved: false,
      judgment: null,
      partial: false,
      points: 0,
    }));
    this.cursor = 0;
    this.eventCursor = 0;
  }

  private isRunningState(): boolean {
    return this.state === 'countdown' || this.state === 'playing' || this.state === 'resuming' || this.state === 'waiting';
  }

  private isActiveAt(clock: number): boolean {
    return this.state !== 'ready' && this.state !== 'finished' && this.transport.acceptsInputAt(clock);
  }

  private songTimeOfInput(clock: number): number {
    const songTime = this.transport.songTime(clock);
    // While Discover waits, the tile sits on the line: any press is on time.
    return this.transport.isWaitingAt(clock) ? songTime : songTime - this.config.inputOffsetMs;
  }

  /** Discover mode: freeze the song exactly when the next unresolved event reaches the line. */
  private beginWaitIfDue(clock: number, songTime: number): boolean {
    const event = this.events[this.eventCursor];
    if (!event || event.timeMs > songTime) return false;
    this.transport.pause(clock - (songTime - event.timeMs), 'wait');
    this.waitingEvent = event;
    this.setState('waiting');
    return true;
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
      if (n.status === 'pending') this.applyNoteJudgment(n, 'miss', null, n.timeMs + window);
    }
  }

  private applyNoteJudgment(note: NoteState, judgment: Judgment, offsetMs: number | null, songTime: number): void {
    if (note.status !== 'pending') return; // each note is judged at most once
    note.status = judgment === 'miss' ? 'missed' : 'hit';
    note.judgment = judgment;
    note.offsetMs = offsetMs;
    note.judgedAt = songTime;
    if (note.status === 'hit') {
      this.offsetSum += offsetMs ?? 0;
      this.hitCount++;
      if (note.isHold) {
        note.hold = 'holding';
        this.holding.add(note);
      }
    }
    while (this.cursor < this.notes.length && this.notes[this.cursor]!.status !== 'pending') this.cursor++;
    this.emit({ type: 'note', note, judgment, offsetMs });

    const event = this.events[note.eventId]!;
    if (!event.resolved && event.notes.every((n) => n.status !== 'pending')) this.resolveEvent(event);
  }

  /**
   * Chord policy (an event of N keys is scored once, when its last key is judged):
   *  - all keys hit → the worst key's judgment, downgraded one step if the keys
   *    were spread over more than `chordWindowMs`; points = base × N;
   *  - some keys hit (partial) → counts as a Miss and breaks the combo, but keeps
   *    `partialChordFactor` of the hit keys' base points;
   *  - no keys hit → Miss.
   * A single note is simply an event with N = 1.
   */
  private resolveEvent(event: EventState): void {
    const hits = event.notes.filter((n) => n.status === 'hit');
    const n = event.notes.length;
    const { scoring } = this.config;
    let judgment: Judgment;
    let points = 0;

    if (hits.length === n) {
      let j = hits.reduce<Judgment>((acc, h) => worstJudgment(acc, h.judgment ?? 'miss'), 'perfect') as HitJudgment;
      if (n > 1) {
        const times = hits.map((h) => h.judgedAt ?? 0);
        if (Math.max(...times) - Math.min(...times) > this.config.chordWindowMs) j = downgradeJudgment(j);
      }
      judgment = j;
      points = pointsFor(j, this.combo, scoring) * n;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    } else {
      judgment = 'miss';
      if (hits.length > 0) {
        event.partial = true;
        this.partialChords++;
        points = Math.round(hits.reduce((sum, h) => sum + scoring.points[h.judgment ?? 'miss'], 0) * scoring.partialChordFactor);
      }
      this.combo = 0;
    }

    event.resolved = true;
    event.judgment = judgment;
    event.points = points;
    this.counts[judgment]++;
    this.score += points;
    while (this.eventCursor < this.events.length && this.events[this.eventCursor]!.resolved) this.eventCursor++;

    const offsets = hits.map((h) => h.offsetMs ?? 0);
    const offsetMs = offsets.length ? offsets.reduce((a, b) => a + b, 0) / offsets.length : null;
    this.emit({ type: 'judgment', event, judgment, offsetMs, points, combo: this.combo, score: this.score });
  }

  private resolveHoldsUntil(songTime: number): void {
    for (const note of [...this.holding]) {
      if (songTime >= note.timeMs + note.durationMs) this.finishHold(note, 'full');
    }
  }

  private finishHold(note: NoteState, result: 'full' | 'early'): void {
    if (!this.holding.delete(note)) return;
    note.hold = result;
    let points = 0;
    if (result === 'full') {
      points = Math.round(this.config.scoring.holdBonus * comboMultiplier(this.combo, this.config.scoring));
      this.score += points;
      this.holdsFull++;
    }
    this.emit({ type: 'hold', note, result, points });
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
      if (n.midi !== midi || n.status !== 'hit' || n.releasedAt !== null) continue;
      n.releasedAt = songTime;
      if (n.hold === 'holding') {
        const end = n.timeMs + n.durationMs;
        this.finishHold(n, songTime >= end - this.config.releaseToleranceMs ? 'full' : 'early');
      }
      return;
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
