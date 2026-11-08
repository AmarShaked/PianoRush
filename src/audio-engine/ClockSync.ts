/**
 * Maps the gameplay clock (performance.now(), ms) to AudioContext time (s).
 *
 * Fed with AudioContext.getOutputTimestamp() pairs: "the sample at
 * `contextTime` is being heard at `performanceTime`". Scheduling a sound at
 * toContextTime(t) therefore makes it *audible* at gameplay time t, which
 * compensates the device's output latency.
 *
 * The two clocks differ only by a near-constant offset (tens of ppm of
 * drift), while individual timestamps occasionally come back stale by a few
 * ms. So the offset is the **median of a sliding window** of recent samples:
 * immune to outliers, yet it follows slow drift continuously and adopts a
 * genuine jump (device change) once it dominates the window.
 */
export class ClockSync {
  private readonly samples: number[] = [];
  private offset: number | null = null; // seconds: contextTime − performanceTime/1000

  constructor(private readonly windowSize = 15) {}

  get isSynced(): boolean {
    return this.offset !== null;
  }

  /** Feed one (contextTime s, performanceTime ms) pair. Invalid pairs are ignored. */
  update(contextTime: number, performanceTimeMs: number): void {
    if (!(contextTime > 0) || !(performanceTimeMs > 0)) return;
    this.samples.push(contextTime - performanceTimeMs / 1000);
    if (this.samples.length > this.windowSize) this.samples.shift();
    const sorted = [...this.samples].sort((a, b) => a - b);
    const m = sorted.length >> 1;
    this.offset = sorted.length % 2 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
  }

  /** Fallback when getOutputTimestamp is unavailable: derive from currentTime and reported latency. */
  updateFromCurrentTime(currentTime: number, nowMs: number, outputLatencySec: number): void {
    this.update(currentTime - outputLatencySec, nowMs);
  }

  toContextTime(performanceTimeMs: number): number {
    if (this.offset === null) throw new Error('ClockSync has no measurement yet');
    return performanceTimeMs / 1000 + this.offset;
  }

  toPerformanceTime(contextTime: number): number {
    if (this.offset === null) throw new Error('ClockSync has no measurement yet');
    return (contextTime - this.offset) * 1000;
  }
}
