interface PauseInterval {
  readonly from: number;
  /** Clock time playback continues; Infinity while still paused with no resume scheduled. */
  to: number;
}

/**
 * Maps a monotonic clock (ms, e.g. performance.now() or — later — an
 * audio-clock-derived time) onto song time (ms relative to beat 0; negative
 * during the count-in). Handles pause and a frozen countdown after resume.
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

  /** Paused (including a scheduled-but-not-yet-reached resume) at this clock time? */
  isPausedAt(clock: number): boolean {
    const last = this.pauses[this.pauses.length - 1];
    return last !== undefined && clock >= last.from && clock < last.to;
  }

  /** Clock time at which a scheduled resume completes, or null. */
  pendingResumeAt(clock: number): number | null {
    const last = this.pauses[this.pauses.length - 1];
    if (!last || !Number.isFinite(last.to) || clock >= last.to) return null;
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

  pause(clock: number): void {
    if (!this.started) return;
    const last = this.pauses[this.pauses.length - 1];
    if (last && clock < last.to) {
      // Already paused, or pausing during the resume countdown: stay paused.
      last.to = Infinity;
      return;
    }
    this.pauses.push({ from: clock, to: Infinity });
  }

  /** Continue playback at `clock + delayMs`; song time stays frozen until then. */
  resume(clock: number, delayMs = 0): void {
    const last = this.pauses[this.pauses.length - 1];
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

  /** True if an event at `clock` happened while the song was running. */
  isRunningAt(clock: number): boolean {
    if (!this.started || clock < this.startClock) return false;
    for (const p of this.pauses) {
      if (clock >= p.from && clock < p.to) return false;
    }
    return true;
  }
}
