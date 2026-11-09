import { describe, expect, it } from 'vitest';
import { SampledPiano } from './SampledPiano';

/** Just enough of an AudioContext for loading and starting sample voices. */
function fakeContext() {
  const started: Array<{ rate: number; offset: number; gain: number; buffer: unknown }> = [];
  const param = (value: number) => ({ value, cancelScheduledValues() {}, setTargetAtTime() {} });
  const ctx = {
    decodeAudioData: async (data: ArrayBuffer) => {
      const name = new TextDecoder().decode(data);
      const channel = new Float32Array(4410);
      channel.fill(0.5, 441); // 10 ms of padding before the attack
      return { name, duration: 0.1, sampleRate: 44100, getChannelData: () => channel };
    },
    createGain: () => ({ gain: param(1), connect() {} }),
    createBufferSource() {
      const node = {
        buffer: null as unknown,
        playbackRate: param(1),
        gainNode: null as null | { gain: { value: number } },
        connect(g: { gain: { value: number } }) {
          node.gainNode = g;
        },
        start(_t: number, offset: number) {
          started.push({ rate: node.playbackRate.value, offset, gain: node.gainNode!.gain.value, buffer: node.buffer });
        },
        stop() {},
      };
      return node;
    },
  };
  return { ctx: ctx as unknown as BaseAudioContext, started };
}

const okFetch = (requested: string[], fail: (url: string) => boolean = () => false) =>
  (async (url: string) => {
    requested.push(url);
    if (fail(url)) return new Response(null, { status: 404 });
    return new Response(url);
  }) as unknown as typeof fetch;

describe('SampledPiano', () => {
  it('returns no voice until samples are loaded (the synth plays meanwhile)', () => {
    const { ctx } = fakeContext();
    const piano = new SampledPiano('s/', okFetch([]));
    expect(piano.voice(ctx, {} as AudioNode, 0, 60, 100)).toBeNull();
    expect(piano.status).toBe('idle');
  });

  it('downloads the most-used layer first, then plays the nearest sample from after its padding', async () => {
    const { ctx, started } = fakeContext();
    const requested: string[] = [];
    const piano = new SampledPiano('s/', okFetch(requested));
    const progress: number[] = [];
    piano.onChange(() => progress.push(piano.progress));
    await piano.load(ctx);
    expect(piano.status).toBe('ready');
    expect(piano.loaded).toBe(120);
    expect(requested.slice(0, 30).every((u) => u.endsWith('v11.mp3'))).toBe(true);
    expect(progress.at(-1)).toBe(1);

    const voice = piano.voice(ctx, {} as AudioNode, 1, 61, 100);
    expect(voice).not.toBeNull();
    expect(started[0]!.rate).toBeCloseTo(2 ** (1 / 12), 10); // C♯4 from the C4 sample
    expect(started[0]!.offset).toBeCloseTo(0.01 - 0.0015, 4);
    expect((started[0]!.buffer as { name: string }).name).toBe('s/60v11.mp3');
  });

  it('falls back to a neighbouring layer when one is missing', async () => {
    const { ctx, started } = fakeContext();
    const piano = new SampledPiano('s/', okFetch([], (u) => u.endsWith('v15.mp3')));
    await piano.load(ctx);
    expect(piano.status).toBe('ready');
    piano.voice(ctx, {} as AudioNode, 0, 60, 127);
    expect((started[0]!.buffer as { name: string }).name).toBe('s/60v11.mp3');
  });

  it('reports an error when offline and can retry later', async () => {
    const { ctx } = fakeContext();
    let online = false;
    const piano = new SampledPiano('s/', okFetch([], () => !online));
    await piano.load(ctx);
    expect(piano.status).toBe('error');
    expect(piano.voice(ctx, {} as AudioNode, 0, 60, 100)).toBeNull();
    online = true;
    await piano.load(ctx);
    expect(piano.status).toBe('ready');
  });
});
