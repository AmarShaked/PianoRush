/**
 * Monophonic pitch detection (YIN, de Cheveigné & Kawahara 2002) for the
 * microphone adapter. Pure: works on any Float32Array, so it is tested with
 * synthetic piano-like signals.
 */
export interface PitchResult {
  /** Detected fundamental in Hz, or null (silence / no clear pitch). */
  readonly frequency: number | null;
  /** 0..1, how periodic the signal is (1 = perfectly periodic). */
  readonly clarity: number;
  /** Root-mean-square level of the buffer. */
  readonly rms: number;
}

export interface PitchOptions {
  readonly minHz?: number;
  readonly maxHz?: number;
  /** YIN absolute threshold on the normalised difference function. */
  readonly threshold?: number;
  /** Below this RMS the buffer counts as silence. */
  readonly silenceRms?: number;
}

export function detectPitch(buf: Float32Array, sampleRate: number, options: PitchOptions = {}): PitchResult {
  const { minHz = 70, maxHz = 1400, threshold = 0.12, silenceRms = 0.004 } = options;
  let sumSq = 0;
  for (let i = 0; i < buf.length; i++) sumSq += buf[i]! * buf[i]!;
  const rms = Math.sqrt(sumSq / buf.length);
  if (rms < silenceRms) return { frequency: null, clarity: 0, rms };

  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  const tauMax = Math.min(Math.floor(sampleRate / minHz), Math.floor(buf.length / 2));
  const w = buf.length - tauMax;
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < w; j++) {
      const diff = buf[j]! - buf[j + tau]!;
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  // Cumulative mean normalised difference.
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau]!;
    cmnd[tau] = running === 0 ? 1 : (d[tau]! * tau) / running;
  }

  let best = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cmnd[tau]! < threshold) {
      while (tau + 1 <= tauMax && cmnd[tau + 1]! < cmnd[tau]!) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) {
    // No dip below the threshold: accept the global minimum only if it is clearly periodic.
    let minVal = Infinity;
    for (let tau = tauMin; tau <= tauMax; tau++) if (cmnd[tau]! < minVal) (minVal = cmnd[tau]!), (best = tau);
    if (minVal > 0.3) return { frequency: null, clarity: 1 - minVal, rms };
  }
  // Parabolic interpolation around the minimum for sub-sample accuracy.
  const x0 = best > 1 ? cmnd[best - 1]! : cmnd[best]!;
  const x1 = cmnd[best]!;
  const x2 = best + 1 <= tauMax ? cmnd[best + 1]! : cmnd[best]!;
  const denom = 2 * (2 * x1 - x2 - x0);
  const shift = denom !== 0 ? (x2 - x0) / denom : 0;
  const tau = best + Math.max(-1, Math.min(1, shift));
  return { frequency: sampleRate / tau, clarity: Math.max(0, Math.min(1, 1 - x1)), rms };
}

export function frequencyToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}
