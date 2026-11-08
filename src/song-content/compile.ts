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
  /** Hold tile: the key must stay down until (near) the note's end. */
  readonly isHold: boolean;
  /** Index of the musical event (single note or chord) this note belongs to. */
  readonly eventId: number;
  /** Tile fades out before the hit line (memory assistance). */
  readonly assistFade: boolean;
}

/**
 * A musical event: every note that starts on the same beat. A single note is
 * an event of size 1; two or more notes form a chord, which is scored as one.
 */
export interface SongEvent {
  readonly id: number;
  readonly startBeat: number;
  readonly timeMs: number;
  readonly noteIds: readonly number[];
}

/** A validated song with beat positions converted to milliseconds. */
export interface CompiledSong {
  readonly definition: SongDefinition;
  readonly msPerBeat: number;
  readonly countInMs: number;
  readonly notes: readonly TimedNote[];
  readonly events: readonly SongEvent[];
  /** Number of hold notes. */
  readonly holdCount: number;
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

export const DEFAULT_HOLD_MIN_BEATS = 1.5;
const EPS = 1e-9;

export function beatsToMs(beats: number, bpm: number): number {
  return (beats * 60000) / bpm;
}

/** Validate and convert a beat-based song into playback time. Throws on invalid data. */
export function compileSong(song: SongDefinition): CompiledSong {
  const result = validateSong(song);
  if (!result.valid) throw new SongValidationError(result.errors);

  const msPerBeat = beatsToMs(1, song.bpm);
  const laneOf = new Map(song.lanes.map((midi, lane) => [midi, lane]));
  const holdMin = song.holdMinBeats ?? DEFAULT_HOLD_MIN_BEATS;
  const fades = song.assist?.fadeRanges ?? [];
  const sorted = [...song.notes].sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);

  const events: SongEvent[] = [];
  const notes: TimedNote[] = [];
  sorted.forEach((n, id) => {
    let event = events[events.length - 1];
    if (!event || Math.abs(event.startBeat - n.startBeat) > EPS) {
      event = { id: events.length, startBeat: n.startBeat, timeMs: beatsToMs(n.startBeat, song.bpm), noteIds: [] };
      events.push(event);
    }
    (event.noteIds as number[]).push(id);
    notes.push({
      id,
      midi: n.midi,
      lane: laneOf.get(n.midi) ?? 0,
      startBeat: n.startBeat,
      durationBeats: n.durationBeats,
      timeMs: event.timeMs,
      durationMs: beatsToMs(n.durationBeats, song.bpm),
      isHold: n.hold ?? n.durationBeats >= holdMin - EPS,
      eventId: event.id,
      assistFade: fades.some(([from, to]) => n.startBeat >= from - EPS && n.startBeat < to - EPS),
    });
  });
  const totalBeats = Math.max(...notes.map((n) => n.startBeat + n.durationBeats));
  return {
    definition: song,
    msPerBeat,
    countInMs: beatsToMs(song.countInBeats, song.bpm),
    notes,
    events,
    holdCount: notes.filter((n) => n.isHold).length,
    endMs: beatsToMs(totalBeats, song.bpm),
    totalBeats,
  };
}
