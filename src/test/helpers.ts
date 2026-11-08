import type { PianoEvent } from '../piano-input/types';
import { compileSong, type CompiledSong } from '../song-content/compile';
import { SONG_SCHEMA_VERSION, type SongNote } from '../song-content/schema';

/** 120 BPM → 500 ms per beat; 4-beat count-in → 2000 ms. */
export const TEST_BPM = 120;
export const MS_PER_BEAT = 500;
export const COUNT_IN_MS = 2000;
export const START_CLOCK = 1000;
/** Clock time of beat 0 when the engine is started at START_CLOCK. */
export const BEAT0 = START_CLOCK + COUNT_IN_MS;

export function makeSong(notes: Array<[midi: number, startBeat: number, durationBeats?: number]>): CompiledSong {
  const songNotes: SongNote[] = notes.map(([midi, startBeat, durationBeats = 1]) => ({ midi, startBeat, durationBeats }));
  return compileSong({
    schemaVersion: SONG_SCHEMA_VERSION,
    id: 'test',
    title: 'Test',
    composer: 'tests',
    bpm: TEST_BPM,
    timeSignature: [4, 4],
    countInBeats: 4,
    lanes: [60, 62, 64, 65, 67],
    notes: songNotes,
  });
}

/** Clock time at which a beat occurs (engine started at START_CLOCK, never paused). */
export function clockAtBeat(beat: number): number {
  return BEAT0 + beat * MS_PER_BEAT;
}

export function on(note: number, time: number, velocity = 100): PianoEvent {
  return { type: 'noteOn', note, velocity, time, channel: 0, source: 'midi', deviceId: 'test' };
}

export function off(note: number, time: number): PianoEvent {
  return { type: 'noteOff', note, velocity: 0, time, channel: 0, source: 'midi', deviceId: 'test' };
}

/** Press and release `duration` ms later. */
export function tap(note: number, time: number, duration = 80): [PianoEvent, PianoEvent] {
  return [on(note, time), off(note, time + duration)];
}
