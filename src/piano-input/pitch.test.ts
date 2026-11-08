import { describe, expect, it } from 'vitest';
import { detectPitch, frequencyToMidi } from './pitch';
import { PitchTracker, type PitchFrame } from './PitchTracker';

const SR = 48000;
const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** A piano-like tone: decaying harmonics with a strong 2nd partial (octave-error bait). */
function pianoTone(midi: number, length = 2048, amp = 0.3, offset = 0): Float32Array {
  const f = midiHz(midi);
  const buf = new Float32Array(length);
  const partials = [1, 0.9, 0.5, 0.3, 0.2, 0.1];
  for (let i = 0; i < length; i++) {
    const t = (i + offset) / SR;
    let v = 0;
    partials.forEach((a, k) => (v += a * Math.sin(2 * Math.PI * f * (k + 1) * t * (1 + 0.0004 * k * k))));
    buf[i] = amp * v * Math.exp(-t * 1.5);
  }
  return buf;
}

function noise(length = 2048, amp = 0.1): Float32Array {
  let seed = 7;
  return Float32Array.from({ length }, () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return amp * (seed / 0x3fffffff - 1);
  });
}

describe('detectPitch (YIN)', () => {
  it.each([45, 48, 55, 60, 64, 67, 72, 76, 84])('detects MIDI %i within a quarter tone, without octave errors', (m) => {
    const r = detectPitch(pianoTone(m), SR);
    expect(r.frequency).not.toBeNull();
    expect(Math.abs(frequencyToMidi(r.frequency!) - m)).toBeLessThan(0.25);
    expect(r.clarity).toBeGreaterThan(0.8);
  });

  it('reports silence as no pitch', () => {
    expect(detectPitch(new Float32Array(2048), SR).frequency).toBeNull();
  });

  it('reports noise as unclear', () => {
    const r = detectPitch(noise(), SR);
    expect(r.frequency === null || r.clarity < 0.7).toBe(true);
  });
});

describe('PitchTracker', () => {
  const frame = (time: number, midi: number | null, rms: number, clarity = 0.95): PitchFrame => ({
    time,
    frequency: midi === null ? null : midiHz(midi),
    clarity,
    rms,
  });

  it('emits noteOn after a stable onset (timestamped at the first frame) and noteOff on decay', () => {
    const t = new PitchTracker({ stableFrames: 2 });
    const events = [
      ...t.process(frame(0, 60, 0.1)),
      ...t.process(frame(20, 60, 0.09)),
      ...t.process(frame(40, 60, 0.05)),
      ...t.process(frame(60, 60, 0.012)), // below 18 % of peak
    ];
    expect(events.map((e) => [e.type, e.note, e.time])).toEqual([['noteOn', 60, 0], ['noteOff', 60, 60]]);
    expect(events[0]!.source).toBe('microphone');
  });

  it('ignores single-frame blips and unclear frames', () => {
    const t = new PitchTracker({ stableFrames: 2 });
    const events = [...t.process(frame(0, 64, 0.1)), ...t.process(frame(20, null, 0.1)), ...t.process(frame(40, 62, 0.1, 0.4))];
    expect(events).toEqual([]);
  });

  it('detects a repeated note on the same key from a sudden rise in level', () => {
    const t = new PitchTracker({ stableFrames: 2 });
    const events = [
      ...t.process(frame(0, 64, 0.1)),
      ...t.process(frame(20, 64, 0.08)),
      ...t.process(frame(100, 64, 0.04)),
      ...t.process(frame(120, 64, 0.12)), // re-struck
    ];
    expect(events.map((e) => [e.type, e.note, e.time])).toEqual([['noteOn', 64, 0], ['noteOff', 64, 120], ['noteOn', 64, 120]]);
  });

  it('switches notes when a new pitch takes over (legato)', () => {
    const t = new PitchTracker({ stableFrames: 2 });
    const events = [
      ...t.process(frame(0, 60, 0.1)),
      ...t.process(frame(20, 60, 0.1)),
      ...t.process(frame(40, 62, 0.1)),
      ...t.process(frame(60, 62, 0.1)),
    ];
    expect(events.map((e) => [e.type, e.note, e.time])).toEqual([['noteOn', 60, 0], ['noteOff', 60, 40], ['noteOn', 62, 40]]);
  });

  it('ignores pitches outside the range (e.g. bass bleeding from speakers)', () => {
    const t = new PitchTracker({ midiRange: [55, 90] });
    expect([...t.process(frame(0, 40, 0.2)), ...t.process(frame(20, 40, 0.2))]).toEqual([]);
  });

  it('end to end: synthetic piano notes through YIN produce the right note sequence', () => {
    const t = new PitchTracker();
    const out: string[] = [];
    // C4 for 300 ms, silence, E4 for 300 ms, analysed every 20 ms.
    for (let ms = 0; ms < 900; ms += 20) {
      const midi = ms < 300 ? 60 : ms >= 400 && ms < 700 ? 64 : null;
      const buf = midi === null ? new Float32Array(2048) : pianoTone(midi, 2048, 0.3, Math.round(((ms % 300) / 1000) * SR));
      const r = detectPitch(buf, SR);
      for (const e of t.process({ time: ms, ...r })) out.push(`${e.type}:${e.note}@${e.time}`);
    }
    expect(out).toEqual(['noteOn:60@0', 'noteOff:60@300', 'noteOn:64@400', 'noteOff:64@700']);
  });
});
