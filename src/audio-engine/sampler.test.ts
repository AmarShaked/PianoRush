import { describe, expect, it } from 'vitest';
import { chooseSample, findOnset, layerFor, layersByPreference, nearestSampledPitch, SAMPLE_LAYERS, sampleFile, SAMPLED_PITCHES } from './sampler';

describe('sampled piano mapping', () => {
  it('covers A0–C8 in minor thirds', () => {
    expect(SAMPLED_PITCHES).toHaveLength(30);
    expect(SAMPLED_PITCHES[0]).toBe(21);
    expect(SAMPLED_PITCHES.at(-1)).toBe(108);
  });

  it('re-pitches every piano key by at most one semitone', () => {
    for (let midi = 21; midi <= 108; midi++) {
      const { pitch, rate } = chooseSample(midi, 90);
      expect(Math.abs(midi - pitch)).toBeLessThanOrEqual(1);
      expect(rate).toBeCloseTo(2 ** ((midi - pitch) / 12), 10);
    }
    expect(nearestSampledPitch(60)).toBe(60);
    expect(nearestSampledPitch(61)).toBe(60);
    expect(nearestSampledPitch(62)).toBe(63);
  });

  it('plays notes outside the piano range from the end samples', () => {
    expect(nearestSampledPitch(10)).toBe(21);
    expect(nearestSampledPitch(120)).toBe(108);
  });

  it('chooses softer layers for softer notes', () => {
    expect(layerFor(20)).toBe(3);
    expect(layerFor(64)).toBe(7);
    expect(layerFor(100)).toBe(11);
    expect(layerFor(127)).toBe(15);
    expect(layersByPreference(100)).toEqual([11, 15, 7, 3]);
  });

  it('gets louder with velocity, continuously across layer changes', () => {
    // Loudness ≈ layer level (~3.8 dB apart) + in-layer gain.
    const layerDb: Record<number, number> = { 3: 0, 7: 3.8, 11: 7.6, 15: 11.4 };
    const loudness = (v: number) => {
      const c = chooseSample(60, v);
      return layerDb[c.layer]! + 20 * Math.log10(c.gain);
    };
    let prev = -Infinity;
    for (let v = 1; v <= 127; v++) {
      const l = loudness(v);
      expect(l).toBeGreaterThan(prev);
      if (v > 1) expect(l - prev).toBeLessThan(1.5); // no audible jump at a layer boundary
      prev = l;
    }
  });

  it('finds the attack after leading silence', () => {
    const sr = 44100;
    const data = new Float32Array(sr);
    for (let i = 1000; i < data.length; i++) data[i] = Math.sin(i / 10) * Math.exp(-(i - 1000) / 8000);
    expect(findOnset(data, sr)).toBeCloseTo(1000 / sr - 0.0015, 3);
    expect(findOnset(new Float32Array(100), sr)).toBe(0);
  });

  it('has every sample file in public/samples', () => {
    const present = new Set(Object.keys(import.meta.glob('/public/samples/salamander/*.mp3')).map((p) => p.split('/').pop()));
    for (const pitch of SAMPLED_PITCHES) {
      for (const layer of SAMPLE_LAYERS) expect(present.has(sampleFile(pitch, layer)), sampleFile(pitch, layer)).toBe(true);
    }
    expect(present.size).toBe(SAMPLED_PITCHES.length * SAMPLE_LAYERS.length);
  });
});
