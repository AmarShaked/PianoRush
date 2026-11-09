/**
 * Note → sample mapping for the sampled grand piano (Salamander Grand Piano V3,
 * Alexander Holm, CC BY 3.0; built by scripts/build-salamander.sh).
 *
 * The set has every minor third from A0 to C8 at 4 of the original 16
 * velocity layers. A note plays the nearest sampled pitch, re-pitched by at
 * most ±1 semitone, from the layer recorded nearest its velocity. Within a
 * layer the gain follows the velocity, so loudness is continuous while the
 * tone colour (brighter when harder) steps between layers like a real piano.
 */

export const SAMPLE_LAYERS = [3, 7, 11, 15] as const;
export type SampleLayer = (typeof SAMPLE_LAYERS)[number];

export const LOWEST_SAMPLE = 21; // A0
export const HIGHEST_SAMPLE = 108; // C8
export const SAMPLE_SPACING = 3;

/** Every sampled pitch: A0, C1, D♯1, F♯1, … C8 (30 notes). */
export const SAMPLED_PITCHES: readonly number[] = Array.from(
  { length: (HIGHEST_SAMPLE - LOWEST_SAMPLE) / SAMPLE_SPACING + 1 },
  (_, i) => LOWEST_SAMPLE + i * SAMPLE_SPACING,
);

/** MIDI velocity each kept layer corresponds to (Salamander's 16 layers spread over 1–127). */
export const LAYER_VELOCITY: Readonly<Record<SampleLayer, number>> = { 3: 36, 7: 68, 11: 98, 15: 122 };

/** Loudness change per velocity step inside a layer (adjacent layers are ~3.5–4 dB apart). */
const DB_PER_VELOCITY = 0.12;

/** Load order: the most-used layer first, so the piano is playable after ~¼ of the download. */
export const LOAD_ORDER: readonly SampleLayer[] = [11, 7, 15, 3];

export interface SampleChoice {
  /** Sampled pitch to play. */
  readonly pitch: number;
  readonly layer: SampleLayer;
  /** Playback rate that turns `pitch` into the requested note. */
  readonly rate: number;
  /** Linear gain for the velocity within the layer. */
  readonly gain: number;
}

export function nearestSampledPitch(midi: number): number {
  const clamped = Math.max(LOWEST_SAMPLE, Math.min(HIGHEST_SAMPLE, midi));
  return LOWEST_SAMPLE + Math.round((clamped - LOWEST_SAMPLE) / SAMPLE_SPACING) * SAMPLE_SPACING;
}

export function layerFor(velocity127: number): SampleLayer {
  let best: SampleLayer = SAMPLE_LAYERS[0];
  for (const layer of SAMPLE_LAYERS) {
    if (Math.abs(LAYER_VELOCITY[layer] - velocity127) < Math.abs(LAYER_VELOCITY[best] - velocity127)) best = layer;
  }
  return best;
}

/** Layers to try for a velocity, nearest first (a missing file falls back to its neighbour). */
export function layersByPreference(velocity127: number): SampleLayer[] {
  return [...SAMPLE_LAYERS].sort((a, b) => Math.abs(LAYER_VELOCITY[a] - velocity127) - Math.abs(LAYER_VELOCITY[b] - velocity127));
}

export function chooseSample(midi: number, velocity127: number, layer: SampleLayer = layerFor(velocity127)): SampleChoice {
  const vel = Math.max(1, Math.min(127, velocity127));
  const pitch = nearestSampledPitch(midi);
  const gainDb = (vel - LAYER_VELOCITY[layer]) * DB_PER_VELOCITY;
  return { pitch, layer, rate: 2 ** ((midi - pitch) / 12), gain: 10 ** (gainDb / 20) };
}

export const sampleFile = (pitch: number, layer: SampleLayer) => `${pitch}v${layer}.mp3`;

/**
 * Where the attack starts (seconds). Decoders differ in how much encoder
 * padding they leave at the start of an MP3, so this is measured on the
 * decoded audio rather than assumed: first sample above 2% of the peak,
 * minus 1.5 ms so the very start of the hammer attack is kept.
 */
export function findOnset(channel: Float32Array, sampleRate: number): number {
  let peak = 0;
  for (let i = 0; i < channel.length; i++) peak = Math.max(peak, Math.abs(channel[i]!));
  if (peak === 0) return 0;
  const threshold = peak * 0.02;
  let i = 0;
  while (i < channel.length && Math.abs(channel[i]!) < threshold) i++;
  return Math.max(0, i / sampleRate - 0.0015);
}
