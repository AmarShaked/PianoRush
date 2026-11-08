/**
 * Small synthesized instruments built from Web Audio primitives. Everything
 * is generated at runtime: no samples, no licensing, works offline. Works on
 * any BaseAudioContext, so it can also be rendered offline for tests.
 */

export interface Voice {
  /** Fade out from `at` (context time) and stop. Safe to call before the voice starts. */
  stop(at: number, fadeSec?: number): void;
  /** Context time when the voice ends on its own. */
  readonly end: number;
}

export const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noise(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff; // deterministic noise
      data[i] = (seed / 0x3fffffff) - 1;
    }
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

function voice(gain: GainNode, sources: AudioScheduledSourceNode[], end: number): Voice {
  for (const s of sources) s.stop(end);
  return {
    end,
    stop(at, fadeSec = 0.06) {
      try {
        gain.gain.cancelScheduledValues(at);
        gain.gain.setTargetAtTime(0, at, Math.max(0.005, fadeSec / 3));
        for (const s of sources) s.stop(Math.min(end, at + fadeSec + 0.05));
      } catch {
        /* already stopped */
      }
    },
  };
}

function envGain(ctx: BaseAudioContext, out: AudioNode): GainNode {
  const g = ctx.createGain();
  g.gain.value = 0;
  g.connect(out);
  return g;
}

export function kick(ctx: BaseAudioContext, out: AudioNode, t: number, vel: number): Voice {
  const g = envGain(ctx, out);
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
  osc.connect(g);
  osc.start(t);
  return voice(g, [osc], t + 0.4);
}

export function snare(ctx: BaseAudioContext, out: AudioNode, t: number, vel: number): Voice {
  const g = envGain(ctx, out);
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1300;
  src.connect(hp).connect(g);
  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.value = 190;
  const bg = ctx.createGain();
  bg.gain.value = 0.5;
  body.connect(bg).connect(g);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel * 0.6, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  src.start(t);
  body.start(t);
  return voice(g, [src, body], t + 0.22);
}

export function hat(ctx: BaseAudioContext, out: AudioNode, t: number, vel: number): Voice {
  const g = envGain(ctx, out);
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7500;
  src.connect(hp).connect(g);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel * 0.4, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  src.start(t, Math.random() * 0.5);
  return voice(g, [src], t + 0.06);
}

export function clap(ctx: BaseAudioContext, out: AudioNode, t: number, vel: number): Voice {
  const g = envGain(ctx, out);
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1400;
  bp.Q.value = 0.9;
  src.connect(bp).connect(g);
  // Three quick bursts then a short tail: the classic hand-clap shape.
  g.gain.setValueAtTime(0.0001, t);
  for (const [dt, level] of [[0, 1], [0.011, 0.8], [0.022, 1]] as const) {
    g.gain.setValueAtTime(vel * 0.7 * level, t + dt);
    g.gain.exponentialRampToValueAtTime(vel * 0.12, t + dt + 0.009);
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  src.start(t, Math.random() * 0.5);
  return voice(g, [src], t + 0.2);
}

export function openHat(ctx: BaseAudioContext, out: AudioNode, t: number, vel: number): Voice {
  const g = envGain(ctx, out);
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 6500;
  src.connect(hp).connect(g);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel * 0.35, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  src.start(t, Math.random() * 0.5);
  return voice(g, [src], t + 0.24);
}

export function crash(ctx: BaseAudioContext, out: AudioNode, t: number, vel: number): Voice {
  const g = envGain(ctx, out);
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4500;
  src.connect(hp).connect(g);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel * 0.28, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  src.start(t);
  return voice(g, [src], t + 1.7);
}

/** Plucky saw bass with a filter "wow" — for dance arrangements. */
export function synthBass(ctx: BaseAudioContext, out: AudioNode, t: number, midi: number, dur: number, vel: number): Voice {
  const g = envGain(ctx, out);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 6;
  lp.frequency.setValueAtTime(1800, t);
  lp.frequency.exponentialRampToValueAtTime(220, t + Math.max(0.08, dur));
  lp.connect(g);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = midiToHz(midi);
  const sub = ctx.createOscillator();
  sub.frequency.value = midiToHz(midi);
  o.connect(lp);
  sub.connect(g);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel * 0.4, t + 0.005);
  g.gain.setTargetAtTime(0, t + Math.max(0.03, dur - 0.03), 0.03);
  o.start(t);
  sub.start(t);
  return voice(g, [o, sub], t + dur + 0.2);
}

export function bass(ctx: BaseAudioContext, out: AudioNode, t: number, midi: number, dur: number, vel: number): Voice {
  const g = envGain(ctx, out);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 650;
  lp.connect(g);
  const f = midiToHz(midi);
  const o1 = ctx.createOscillator();
  o1.type = 'triangle';
  o1.frequency.value = f;
  const o2 = ctx.createOscillator();
  o2.frequency.value = f;
  o1.connect(lp);
  o2.connect(lp);
  const peak = vel * 0.55;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.008);
  g.gain.setTargetAtTime(peak * 0.7, t + 0.01, 0.15);
  g.gain.setTargetAtTime(0, t + Math.max(0.05, dur - 0.04), 0.03);
  o1.start(t);
  o2.start(t);
  return voice(g, [o1, o2], t + dur + 0.2);
}

export function pad(ctx: BaseAudioContext, out: AudioNode, t: number, midi: number, dur: number, vel: number): Voice {
  const g = envGain(ctx, out);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1300;
  lp.connect(g);
  const f = midiToHz(midi);
  const oscs = [-7, 7].map((cents) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = cents;
    o.connect(lp);
    o.start(t);
    return o;
  });
  const peak = vel * 0.18;
  const attack = Math.min(0.25, dur / 3);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(0, t + Math.max(attack, dur - 0.05), 0.12);
  return voice(g, oscs, t + dur + 0.7);
}

export function keys(ctx: BaseAudioContext, out: AudioNode, t: number, midi: number, dur: number, vel: number): Voice {
  const g = envGain(ctx, out);
  const f = midiToHz(midi);
  const o1 = ctx.createOscillator();
  o1.frequency.value = f;
  const o2 = ctx.createOscillator();
  o2.type = 'triangle';
  o2.frequency.value = f * 2;
  const g2 = ctx.createGain();
  g2.gain.value = 0.15;
  o1.connect(g);
  o2.connect(g2).connect(g);
  const peak = vel * 0.45;
  const decay = Math.min(1.6, dur + 0.4);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o1.start(t);
  o2.start(t);
  return voice(g, [o1, o2], t + decay + 0.02);
}

export function click(ctx: BaseAudioContext, out: AudioNode, t: number, accent: boolean, vel = 1): Voice {
  const g = envGain(ctx, out);
  const o = ctx.createOscillator();
  o.frequency.value = accent ? 1760 : 1175;
  o.connect(g);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  o.start(t);
  return voice(g, [o], t + 0.05);
}

/**
 * Built-in piano for "virtual piano" mode: three partials with a
 * velocity-dependent brightness and a natural decay; noteOff damps it.
 */
export function piano(ctx: BaseAudioContext, out: AudioNode, t: number, midi: number, velocity127: number): Voice {
  const v = Math.max(0.05, Math.min(1, velocity127 / 127)) ** 1.6;
  const g = envGain(ctx, out);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900 + 4500 * v, t);
  lp.frequency.exponentialRampToValueAtTime(700 + 1200 * v, t + 1.2);
  lp.connect(g);
  const f = midiToHz(midi);
  const partials: [mult: number, type: OscillatorType, level: number][] = [
    [1, 'triangle', 1],
    [2, 'sine', 0.35],
    [3, 'sine', 0.12],
  ];
  const oscs = partials.map(([mult, type, level]) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f * mult;
    o.detune.value = mult === 2 ? 3 : 0;
    const pg = ctx.createGain();
    pg.gain.value = level;
    o.connect(pg).connect(lp);
    o.start(t);
    return o;
  });
  const decay = 3.2 - Math.min(2, Math.max(0, (midi - 48) / 24)); // lower notes ring longer
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.5 * v, t + 0.004);
  g.gain.setTargetAtTime(0.0001, t + 0.004, decay / 4);
  return voice(g, oscs, t + decay + 0.5);
}

/** Soft lead for the band's melody (Chord City): filtered square with gentle vibrato. */
export function lead(ctx: BaseAudioContext, out: AudioNode, t: number, midi: number, dur: number, vel: number): Voice {
  const g = envGain(ctx, out);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  lp.connect(g);
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = midiToHz(midi);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.5;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(6, t + Math.min(0.4, dur)); // cents-ish vibrato fades in
  lfo.connect(depth).connect(o.detune);
  o.connect(lp);
  const peak = vel * 0.16;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.015);
  g.gain.setTargetAtTime(peak * 0.75, t + 0.02, 0.2);
  g.gain.setTargetAtTime(0, t + Math.max(0.03, dur - 0.04), 0.04);
  o.start(t);
  lfo.start(t);
  return voice(g, [o, lfo], t + dur + 0.25);
}
