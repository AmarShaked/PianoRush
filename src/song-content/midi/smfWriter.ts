/**
 * Minimal SMF writer (format 1). Used by tests to build fixtures, and by the
 * importer to export a simplified arrangement as a .mid file.
 */
export interface WriterNote {
  readonly tick: number;
  readonly durationTicks: number;
  readonly midi: number;
  readonly velocity?: number;
  readonly channel?: number;
}

export interface WriterTrack {
  readonly name?: string;
  readonly notes: readonly WriterNote[];
}

function varLen(n: number): number[] {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}

export function writeSmf(
  tracks: readonly WriterTrack[],
  opts: { ticksPerQuarter?: number; bpm?: number; timeSignature?: readonly [number, number]; runningStatus?: boolean } = {},
): Uint8Array {
  const ppq = opts.ticksPerQuarter ?? 480;
  const chunks: number[][] = [];
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length + 1, (ppq >> 8) & 0xff, ppq & 0xff];
  // Conductor track: tempo + time signature.
  const us = Math.round(60_000_000 / (opts.bpm ?? 120));
  const [num, den] = opts.timeSignature ?? [4, 4];
  const conductor = [0, 0xff, 0x51, 3, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff, 0, 0xff, 0x58, 4, num, Math.log2(den), 24, 8, 0, 0xff, 0x2f, 0];
  chunks.push(conductor);
  for (const t of tracks) {
    const events: { tick: number; bytes: number[] }[] = [];
    for (const n of t.notes) {
      const ch = n.channel ?? 0;
      events.push({ tick: n.tick, bytes: [0x90 | ch, n.midi, n.velocity ?? 90] });
      events.push({ tick: n.tick + n.durationTicks, bytes: opts.runningStatus ? [0x90 | ch, n.midi, 0] : [0x80 | ch, n.midi, 0] });
    }
    events.sort((a, b) => a.tick - b.tick || (a.bytes[2] === 0 || (a.bytes[0]! & 0xf0) === 0x80 ? -1 : 1));
    const body: number[] = [];
    if (t.name) {
      const nameBytes = [...new TextEncoder().encode(t.name)];
      body.push(0, 0xff, 0x03, ...varLen(nameBytes.length), ...nameBytes);
    }
    let last = 0;
    let lastStatus = -1;
    for (const e of events) {
      body.push(...varLen(e.tick - last));
      last = e.tick;
      if (opts.runningStatus && e.bytes[0] === lastStatus) body.push(...e.bytes.slice(1));
      else body.push(...e.bytes);
      lastStatus = e.bytes[0]!;
    }
    body.push(0, 0xff, 0x2f, 0);
    chunks.push(body);
  }
  const out: number[] = [...header];
  for (const c of chunks) out.push(0x4d, 0x54, 0x72, 0x6b, (c.length >>> 24) & 0xff, (c.length >> 16) & 0xff, (c.length >> 8) & 0xff, c.length & 0xff, ...c);
  return new Uint8Array(out);
}
