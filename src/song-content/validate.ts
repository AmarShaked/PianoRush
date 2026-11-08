import { SONG_SCHEMA_VERSION, type SongDefinition } from './schema';

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
}

const EPS = 1e-9;

/** Validate a song definition before gameplay. Returns all problems found. */
export function validateSong(song: SongDefinition): ValidationResult {
  const errors: string[] = [];
  const err = (msg: string) => errors.push(msg);

  if (song.schemaVersion !== SONG_SCHEMA_VERSION) err(`Unsupported schemaVersion ${String(song.schemaVersion)}`);
  if (!song.id) err('Song id is required');
  if (!song.title) err('Song title is required');
  if (!(Number.isFinite(song.bpm) && song.bpm >= 20 && song.bpm <= 400)) err(`BPM out of range: ${song.bpm}`);
  const [beatsPerBar, beatUnit] = song.timeSignature;
  if (!(Number.isInteger(beatsPerBar) && beatsPerBar > 0) || ![1, 2, 4, 8, 16].includes(beatUnit)) {
    err(`Invalid time signature ${beatsPerBar}/${beatUnit}`);
  }
  if (!(Number.isInteger(song.countInBeats) && song.countInBeats >= 0)) err('countInBeats must be a non-negative integer');

  if (song.lanes.length === 0) err('At least one lane is required');
  const laneSet = new Set<number>();
  song.lanes.forEach((midi, i) => {
    if (!Number.isInteger(midi) || midi < 0 || midi > 127) err(`Lane ${i} has invalid MIDI pitch ${midi}`);
    if (laneSet.has(midi)) err(`Lane pitch ${midi} is duplicated`);
    laneSet.add(midi);
  });

  if (song.notes.length === 0) err('Song has no notes');
  if (song.holdMinBeats !== undefined && !(song.holdMinBeats > 0)) err('holdMinBeats must be positive');
  song.assist?.fadeRanges?.forEach(([from, to], i) => {
    if (!(Number.isFinite(from) && Number.isFinite(to) && from >= 0 && to > from)) err(`Fade range ${i} is invalid`);
  });

  const lastEndByPitch = new Map<number, number>();
  const sorted = [...song.notes].map((n, i) => ({ n, i })).sort((a, b) => a.n.startBeat - b.n.startBeat);
  for (const { n, i } of sorted) {
    if (!laneSet.has(n.midi)) err(`Note ${i}: pitch ${n.midi} is not mapped to a lane`);
    if (!(Number.isFinite(n.startBeat) && n.startBeat >= 0)) err(`Note ${i}: invalid startBeat ${n.startBeat}`);
    if (!(Number.isFinite(n.durationBeats) && n.durationBeats > 0)) err(`Note ${i}: invalid durationBeats ${n.durationBeats}`);
    const prevEnd = lastEndByPitch.get(n.midi);
    if (prevEnd !== undefined && n.startBeat < prevEnd - EPS) {
      err(`Note ${i}: pitch ${n.midi} at beat ${n.startBeat} overlaps the previous note of the same pitch`);
    }
    lastEndByPitch.set(n.midi, n.startBeat + n.durationBeats);
  }

  return { valid: errors.length === 0, errors };
}
