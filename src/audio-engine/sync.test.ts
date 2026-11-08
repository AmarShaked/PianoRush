import { describe, expect, it } from 'vitest';
import { ClockSync } from './ClockSync';
import { analyzeTaps, isHighLatency } from './calibration';

describe('ClockSync', () => {
  it('maps performance time to the context time that will be audible then', () => {
    const sync = new ClockSync();
    // Context sample 10.000 s is heard at performance time 5000 ms.
    sync.update(10, 5000);
    expect(sync.toContextTime(5250)).toBeCloseTo(10.25);
    expect(sync.toPerformanceTime(11)).toBeCloseTo(6000);
  });

  it('ignores occasional stale timestamps (outliers of several ms)', () => {
    const sync = new ClockSync(15);
    for (let i = 0; i < 100; i++) {
      const stale = i % 7 === 3 ? -0.009 : 0; // a 9 ms stale reading every 7th sample
      sync.update(10 + i * 0.1 + stale + (i % 2 ? 0.0001 : -0.0001), 5000 + i * 100);
      expect(Math.abs(sync.toContextTime(5000 + i * 100) - (10 + i * 0.1))).toBeLessThan(0.0002);
    }
  });

  it('follows a slow drift between the two clocks', () => {
    const sync = new ClockSync(15);
    // Audio clock runs 100 ppm fast over 60 s of updates every 100 ms.
    for (let t = 0; t <= 60_000; t += 100) sync.update(1 + (t / 1000) * 1.0001, 1 + t);
    // The median lags by half a window (0.7 s × 100 ppm = 0.07 ms): negligible.
    expect(Math.abs(sync.toContextTime(60_001) - (1 + 60 * 1.0001))).toBeLessThan(0.0002);
  });

  it('adopts a genuine jump (device change) once it dominates the window', () => {
    const sync = new ClockSync(5);
    for (let i = 0; i < 5; i++) sync.update(10 + i, 5000 + i * 1000);
    for (let i = 5; i < 8; i++) sync.update(20 + i, 5000 + i * 1000);
    expect(sync.toContextTime(13_000)).toBeCloseTo(28);
  });

  it('ignores invalid samples', () => {
    const sync = new ClockSync();
    sync.update(10, 5000);
    sync.update(0, 5100);
    sync.update(10.1, 0);
    expect(sync.toContextTime(5000)).toBeCloseTo(10);
  });

  it('fallback: subtracts the reported output latency', () => {
    const sync = new ClockSync();
    sync.updateFromCurrentTime(10, 5000, 0.04);
    expect(sync.toContextTime(5000)).toBeCloseTo(9.96);
  });

  it('throws before the first measurement', () => {
    expect(() => new ClockSync().toContextTime(0)).toThrow();
  });
});

describe('tap calibration', () => {
  const clicks = Array.from({ length: 12 }, (_, i) => 1000 + i * 600);

  it('reports the median offset of consistent taps and suggests it as input offset', () => {
    const taps = clicks.map((c, i) => c + 42 + (i % 3) * 4 - 4);
    const r = analyzeTaps(clicks, taps);
    expect(r.offsets).toHaveLength(12);
    expect(r.medianMs).toBe(42);
    expect(r.reliable).toBe(true);
    expect(r.suggestedOffsetMs).toBe(40);
  });

  it('ignores stray taps far from any click and double taps', () => {
    const taps = [...clicks.map((c) => c + 30), 1300, 1000 + 600 * 3 + 32];
    const r = analyzeTaps(clicks, taps);
    expect(r.offsets).toHaveLength(12);
    expect(r.medianMs).toBe(30);
  });

  it('is unreliable with too few or too scattered taps', () => {
    expect(analyzeTaps(clicks, clicks.slice(0, 4).map((c) => c + 20)).reliable).toBe(false);
    const scattered = clicks.map((c, i) => c + (i % 2 ? 150 : -150));
    const r = analyzeTaps(clicks, scattered);
    expect(r.reliable).toBe(false);
    expect(r.suggestedOffsetMs).toBeNull();
  });

  it('handles no taps', () => {
    expect(analyzeTaps(clicks, [])).toMatchObject({ medianMs: null, reliable: false });
  });

  it('flags Bluetooth-like output latency', () => {
    expect(isHighLatency(0.02)).toBe(false);
    expect(isHighLatency(0.18)).toBe(true);
    expect(isHighLatency(undefined)).toBe(false);
  });
});
