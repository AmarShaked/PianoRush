import type { SongDefinition } from './schema';
import { validateSong } from './validate';

/** A note converted to playback time (ms from beat 0). */
export interface TimedNote {
  /** Stable index-based id within the song. */
  readonly id: number;
  readonly midi: number;
  readonly lane: number;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly timeMs: number;
  readonly durationMs: number;
}

/** A validated song with beat positions converted to milliseconds. */
export interface CompiledSong {
  readonly definition: SongDefinition;
  readonly msPerBeat: number;
  readonly countInMs: number;
  readonly notes: readonly TimedNote[];
  /** Time (ms from beat 0) at which the last note ends. */
  readonly endMs: number;
  readonly totalBeats: number;
}

export class SongValidationError extends Error {
  constructor(readonly errors: string[]) {
    super(`Invalid song: ${errors.join('; ')}`);
    this.name = 'SongValidationError';
  }
}

export function beatsToMs(beats: number, bpm: number): number {
  return (beats * 60000) / bpm;
}

/** Validate and convert a beat-based song into playback time. Throws on invalid data. */
export function compileSong(song: SongDefinition): CompiledSong {
  const result = validateSong(song);
  if (!result.valid) throw new SongValidationError(result.errors);

  const msPerBeat = beatsToMs(1, song.bpm);
  const laneOf = new Map(song.lanes.map((midi, lane) => [midi, lane]));
  const notes: TimedNote[] = [...song.notes]
    .sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi)
    .map((n, id) => ({
      id,
      midi: n.midi,
      lane: laneOf.get(n.midi) ?? 0,
      startBeat: n.startBeat,
      durationBeats: n.durationBeats,
      timeMs: beatsToMs(n.startBeat, song.bpm),
      durationMs: beatsToMs(n.durationBeats, song.bpm),
    }));
  const totalBeats = Math.max(...notes.map((n) => n.startBeat + n.durationBeats));
  return {
    definition: song,
    msPerBeat,
    countInMs: beatsToMs(song.countInBeats, song.bpm),
    notes,
    endMs: beatsToMs(totalBeats, song.bpm),
    totalBeats,
  };
}
