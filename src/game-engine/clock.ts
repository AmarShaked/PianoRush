/**
 * The single monotonic time source for gameplay (ms).
 *
 * M1 uses performance.now(), which is also the time base of Web MIDI and DOM
 * event timestamps. The M3 audio engine will provide a Clock derived from the
 * AudioContext (via getOutputTimestamp) so that audio becomes the master clock
 * without any engine changes.
 */
export interface Clock {
  now(): number;
}

export const performanceClock: Clock = {
  now: () => performance.now(),
};

/** Manually advanced clock for deterministic tests. */
export class ManualClock implements Clock {
  constructor(private t = 0) {}
  now(): number {
    return this.t;
  }
  set(t: number): void {
    this.t = t;
  }
  advance(ms: number): number {
    this.t += ms;
    return this.t;
  }
}
