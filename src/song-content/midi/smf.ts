/**
 * Standard MIDI File (SMF) reader — formats 0 and 1, PPQ timing.
 * Pure TypeScript, no dependencies. Used to import licensed songs.
 */

export interface SmfNote {
  readonly tick: number;
  readonly durationTicks: number;
  readonly midi: number;
  readonly velocity: number;
  readonly channel: number;
}

export interface SmfTrack {
  readonly index: number;
  readonly name: string;
  readonly notes: readonly SmfNote[];
  /** Channels used by this track's notes. */
  readonly channels: readonly number[];
}

export interface SmfFile {
  readonly format: number;
  readonly ticksPerQuarter: number;
  /** Tempo changes (microseconds per quarter note). */
  readonly tempos: readonly { readonly tick: number; readonly usPerQuarter: number }[];
  readonly timeSignatures: readonly { readonly tick: number; readonly numerator: number; readonly denominator: number }[];
  readonly tracks: readonly SmfTrack[];
}

export class SmfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmfError';
  }
}

class Reader {
  pos = 0;
  constructor(readonly bytes: Uint8Array, readonly end = bytes.length) {}
  u8(): number {
    if (this.pos >= this.end) throw new SmfError('Unexpected end of MIDI data');
    return this.bytes[this.pos++]!;
  }
  u16(): number {
    return (this.u8() << 8) | this.u8();
  }
  u32(): number {
    return ((this.u8() << 24) >>> 0) + (this.u8() << 16) + (this.u8() << 8) + this.u8();
  }
  str(n: number): string {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8());
    return s;
  }
  varLen(): number {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.u8();
      value = (value << 7) | (b & 0x7f);
      if (!(b & 0x80)) return value;
    }
    throw new SmfError('Invalid variable-length quantity');
  }
  skip(n: number): void {
    this.pos += n;
    if (this.pos > this.end) throw new SmfError('Unexpected end of MIDI data');
  }
}

function decodeText(r: Reader, len: number): string {
  const bytes = r.bytes.subarray(r.pos, r.pos + len);
  r.skip(len);
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/\0/g, '').trim();
  } catch {
    return '';
  }
}

export function parseSmf(data: ArrayBuffer | Uint8Array): SmfFile {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const r = new Reader(bytes);
  if (r.str(4) !== 'MThd') throw new SmfError('Not a MIDI file (missing MThd header)');
  const headerLen = r.u32();
  const format = r.u16();
  const ntrks = r.u16();
  const division = r.u16();
  r.skip(headerLen - 6);
  if (division & 0x8000) throw new SmfError('SMPTE-timed MIDI files are not supported (use a tempo-based export)');
  if (format > 1) throw new SmfError(`MIDI format ${format} is not supported (use format 0 or 1)`);

  const tempos: { tick: number; usPerQuarter: number }[] = [];
  const timeSignatures: { tick: number; numerator: number; denominator: number }[] = [];
  const tracks: SmfTrack[] = [];

  for (let t = 0; t < ntrks && r.pos < bytes.length; t++) {
    const id = r.str(4);
    const len = r.u32();
    if (id !== 'MTrk') {
      r.skip(len);
      t--;
      continue;
    }
    const tr = new Reader(bytes, r.pos + len);
    tr.pos = r.pos;
    r.skip(len);

    let tick = 0;
    let status = 0;
    let name = '';
    const open = new Map<string, { tick: number; velocity: number }[]>();
    const notes: SmfNote[] = [];
    const close = (channel: number, midi: number, at: number) => {
      const key = `${channel}:${midi}`;
      const stack = open.get(key);
      const start = stack?.shift();
      if (start) notes.push({ tick: start.tick, durationTicks: Math.max(1, at - start.tick), midi, velocity: start.velocity, channel });
    };

    while (tr.pos < tr.end) {
      tick += tr.varLen();
      let b = tr.u8();
      if (b === 0xff) {
        const type = tr.u8();
        const mlen = tr.varLen();
        if (type === 0x03 && !name) name = decodeText(tr, mlen);
        else if (type === 0x51 && mlen === 3) tempos.push({ tick, usPerQuarter: (tr.u8() << 16) | (tr.u8() << 8) | tr.u8() });
        else if (type === 0x58 && mlen >= 2) {
          const numerator = tr.u8();
          const denominator = 2 ** tr.u8();
          tr.skip(mlen - 2);
          timeSignatures.push({ tick, numerator, denominator });
        } else if (type === 0x2f) {
          tr.skip(mlen);
          break;
        } else tr.skip(mlen);
        continue;
      }
      if (b === 0xf0 || b === 0xf7) {
        tr.skip(tr.varLen());
        continue;
      }
      if (b < 0x80) {
        // Running status: this byte is the first data byte.
        if (!status) throw new SmfError('Running status without a previous status byte');
        tr.pos--;
        b = status;
      } else {
        status = b;
      }
      const cmd = b & 0xf0;
      const channel = b & 0x0f;
      if (cmd === 0x90 || cmd === 0x80) {
        const midi = tr.u8();
        const velocity = tr.u8();
        if (cmd === 0x90 && velocity > 0) {
          const key = `${channel}:${midi}`;
          if (!open.has(key)) open.set(key, []);
          open.get(key)!.push({ tick, velocity });
        } else {
          close(channel, midi, tick);
        }
      } else if (cmd === 0xa0 || cmd === 0xb0 || cmd === 0xe0) {
        tr.skip(2);
      } else if (cmd === 0xc0 || cmd === 0xd0) {
        tr.skip(1);
      }
    }
    // Close notes left hanging at the end of the track.
    for (const [key, stack] of open) {
      const [ch, m] = key.split(':').map(Number) as [number, number];
      while (stack.length) close(ch, m, tick);
    }
    notes.sort((a, b) => a.tick - b.tick || a.midi - b.midi);
    const channels = [...new Set(notes.map((n) => n.channel))].sort((a, b) => a - b);
    if (channels.length > 1) {
      // One track holding several instruments (always the case in format-0 files):
      // split it per channel so the melody can be chosen on its own.
      for (const ch of channels) {
        tracks.push({
          index: tracks.length,
          name: `${name || `Track ${t + 1}`} · ch ${ch + 1}${ch === 9 ? ' (drums)' : ''}`,
          notes: notes.filter((n) => n.channel === ch),
          channels: [ch],
        });
      }
    } else {
      tracks.push({ index: tracks.length, name, notes, channels });
    }
  }

  return {
    format,
    ticksPerQuarter: division,
    tempos: tempos.sort((a, b) => a.tick - b.tick),
    timeSignatures: timeSignatures.sort((a, b) => a.tick - b.tick),
    tracks,
  };
}
