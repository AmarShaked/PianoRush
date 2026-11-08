import { GameEngine, type GameSnapshot } from '../game-engine/GameEngine';
import type { EngineConfigInput } from '../game-engine/config';
import { performanceClock, type Clock } from '../game-engine/clock';
import type { InputStatusEvent, PianoInputSource } from '../piano-input/types';
import type { CompiledSong } from '../song-content/compile';

export type SessionNotice =
  | { readonly type: 'device-disconnected'; readonly deviceName: string }
  | { readonly type: 'device-reconnected'; readonly deviceName: string };

export interface GameSessionOptions {
  readonly song: CompiledSong;
  readonly inputs: readonly PianoInputSource[];
  readonly engineConfig?: EngineConfigInput;
  readonly clock?: Clock;
}

/**
 * Framework-free orchestration of one level: wires input sources into the
 * engine, owns the clock, auto-pauses on device disconnect, and exposes a
 * per-frame `frame()` for the renderer. React screens drive this object; it
 * has no React or PixiJS dependencies and is unit-tested directly.
 */
export class GameSession {
  readonly engine: GameEngine;
  private readonly clock: Clock;
  private readonly unsubscribers: Array<() => void> = [];
  private readonly noticeListeners = new Set<(n: SessionNotice) => void>();
  private disposed = false;

  constructor(options: GameSessionOptions) {
    this.clock = options.clock ?? performanceClock;
    this.engine = new GameEngine(options.song, options.engineConfig);
    for (const input of options.inputs) {
      this.unsubscribers.push(input.subscribe((e) => this.engine.handleInput(e)));
      if (input.subscribeStatus) {
        this.unsubscribers.push(input.subscribeStatus((s) => this.handleStatus(s)));
      }
    }
  }

  now(): number {
    return this.clock.now();
  }

  /** Begin the count-in, optionally `delayMs` in the future (gives audio time to queue the first click). */
  start(delayMs = 0): void {
    this.engine.start(this.clock.now() + delayMs);
  }

  pause(): void {
    this.engine.pause(this.clock.now());
  }

  resume(): void {
    this.engine.resume(this.clock.now());
  }

  togglePause(): void {
    if (this.engine.currentState === 'paused') this.resume();
    else this.pause();
  }

  /** Reset score and timeline and immediately begin a fresh count-in. */
  restart(delayMs = 0): void {
    this.engine.restart();
    this.engine.start(this.clock.now() + delayMs);
  }

  /** Advance the engine to "now" and return the state to draw. Call once per animation frame. */
  frame(): GameSnapshot {
    const now = this.clock.now();
    this.engine.update(now);
    return this.engine.getSnapshot(now);
  }

  onNotice(listener: (n: SessionNotice) => void): () => void {
    this.noticeListeners.add(listener);
    return () => {
      this.noticeListeners.delete(listener);
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers.length = 0;
    this.noticeListeners.clear();
  }

  private handleStatus(status: InputStatusEvent): void {
    if (status.type === 'disconnected') {
      this.engine.pause(this.clock.now());
      this.notify({ type: 'device-disconnected', deviceName: status.deviceName });
    } else {
      this.notify({ type: 'device-reconnected', deviceName: status.deviceName });
    }
  }

  private notify(n: SessionNotice): void {
    for (const l of [...this.noticeListeners]) l(n);
  }
}
