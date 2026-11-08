/** `user`: the player paused (input ignored). `wait`: Discover mode is waiting for notes (input accepted). */
export type PauseKind = 'user' | 'wait';

interface PauseInterval {
  readonly kind: PauseKind;
  readonly from: number;
  /** Clock time playback continues; Infinity while open. */
  to: number;
}

/**
 * Maps a monotonic clock (ms, e.g. performance.now() or — later — an
 * audio-clock-derived time) onto song time (ms relative to beat 0; negative
 * during the count-in). Handles user pauses, a frozen countdown after resume,
 * and Discover-mode waits.
 *
 * Song time is a pure function of clock time + pause history, so it never
 * depends on how often (or how late) anyone asks for it: an input event
 * delivered late is still mapped by its own timestamp.
 */
export class Transport {
  private startClock = 0;
  private started = false;
  private readonly pauses: PauseInterval[] = [];

  constructor(private readonly countInMs: number) {}

  get isStarted(): boolean {
    return this.started;
  }

  /** Frozen for any reason at this clock time? */
  isPausedAt(clock: number): boolean {
    return this.intervalAt(clock) !== null;
  }

  isUserPausedAt(clock: number): boolean {
    return this.intervalAt(clock)?.kind === 'user';
  }

  isWaitingAt(clock: number): boolean {
    return this.intervalAt(clock)?.kind === 'wait';
  }

  /** Clock time at which a scheduled resume (from a user pause) completes, or null. */
  pendingResumeAt(clock: number): number | null {
    const last = this.last();
    if (!last || last.kind !== 'user' || !Number.isFinite(last.to) || clock >= last.to) return null;
    return last.to;
  }

  start(clock: number): void {
    this.startClock = clock;
    this.pauses.length = 0;
    this.started = true;
  }

  reset(): void {
    this.started = false;
    this.pauses.length = 0;
  }

  pause(clock: number, kind: PauseKind = 'user'): void {
    if (!this.started) return;
    const last = this.last();
    if (last && Number.isFinite(last.to) && clock < last.to && kind === 'wait') {
      clock = last.to; // a wait can only begin once the previous interval has ended
    }
    if (last && clock < last.to) {
      if (last.kind === kind) {
        last.to = Infinity; // already paused (or pausing during the resume countdown)
      } else if (kind === 'user') {
        // The player pauses while Discover is waiting: end the wait, start a user pause.
        last.to = Math.max(clock, last.from);
        this.pauses.push({ kind, from: last.to, to: Infinity });
      }
      return;
    }
    this.pauses.push({ kind, from: clock, to: Infinity });
  }

  /** Continue at `clock + delayMs`; song time stays frozen until then. */
  resume(clock: number, delayMs = 0): void {
    const last = this.last();
    if (!last || last.to !== Infinity) return;
    last.to = Math.max(clock + Math.max(0, delayMs), last.from);
  }

  songTime(clock: number): number {
    let paused = 0;
    for (const p of this.pauses) {
      if (clock <= p.from) break;
      paused += Math.min(p.to, clock) - p.from;
    }
    return clock - this.startClock - paused - this.countInMs;
  }

  /** True if input at `clock` should be processed (running, or waiting for notes). */
  acceptsInputAt(clock: number): boolean {
    if (!this.started || clock < this.startClock) return false;
    return this.intervalAt(clock)?.kind !== 'user';
  }

  private last(): PauseInterval | undefined {
    return this.pauses[this.pauses.length - 1];
  }

  private intervalAt(clock: number): PauseInterval | null {
    for (let i = this.pauses.length - 1; i >= 0; i--) {
      const p = this.pauses[i]!;
      if (clock >= p.from && clock < p.to) return p;
      if (p.to <= clock) break;
    }
    return null;
  }
}
