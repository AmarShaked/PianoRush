/**
 * Tap-along calibration analysis.
 *
 * The player taps any key in time with audible clicks. Because the beat is
 * steady and predictable, players *anticipate* it: this measures the combined
 * audio-output + input latency (plus a small personal bias), not reaction time.
 * The device-reported output latency is shown separately in the UI.
 */
export interface TapAnalysis {
  /** Signed offsets (tap − click, ms) of the taps that matched a click. */
  readonly offsets: readonly number[];
  readonly medianMs: number | null;
  /** Median absolute deviation from the median: how consistent the taps were. */
  readonly spreadMs: number | null;
  /** Enough consistent taps to trust the result. */
  readonly reliable: boolean;
  /** Input offset to apply (rounded to 5 ms), or null. */
  readonly suggestedOffsetMs: number | null;
}

export const MIN_TAPS = 6;
export const MAX_SPREAD_MS = 45;

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Match each tap to the nearest unused click within 40 % of the click
 * interval, then summarise. Taps far from any click (double taps, stray keys)
 * are ignored.
 */
export function analyzeTaps(clickTimes: readonly number[], tapTimes: readonly number[]): TapAnalysis {
  const interval = clickTimes.length > 1 ? median(clickTimes.slice(1).map((t, i) => t - clickTimes[i]!)) : 1000;
  const maxDistance = interval * 0.4;
  const used = new Set<number>();
  const offsets: number[] = [];
  for (const tap of tapTimes) {
    let best = -1;
    for (let i = 0; i < clickTimes.length; i++) {
      if (used.has(i)) continue;
      if (best < 0 || Math.abs(tap - clickTimes[i]!) < Math.abs(tap - clickTimes[best]!)) best = i;
    }
    if (best >= 0 && Math.abs(tap - clickTimes[best]!) <= maxDistance) {
      used.add(best);
      offsets.push(tap - clickTimes[best]!);
    }
  }
  if (offsets.length === 0) return { offsets, medianMs: null, spreadMs: null, reliable: false, suggestedOffsetMs: null };
  const med = median(offsets);
  const spread = median(offsets.map((o) => Math.abs(o - med)));
  const reliable = offsets.length >= MIN_TAPS && spread <= MAX_SPREAD_MS;
  return {
    offsets,
    medianMs: med,
    spreadMs: spread,
    reliable,
    suggestedOffsetMs: reliable ? Math.round(med / 5) * 5 : null,
  };
}

/** Bluetooth / wireless outputs typically add 100–300 ms. */
export const HIGH_LATENCY_SEC = 0.1;

export function isHighLatency(outputLatencySec: number | null | undefined): boolean {
  return typeof outputLatencySec === 'number' && outputLatencySec >= HIGH_LATENCY_SEC;
}
