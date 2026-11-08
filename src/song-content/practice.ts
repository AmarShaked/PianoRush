import type { BackingSpec, SongDefinition, SongNote } from './schema';
import { chordAt } from './chords';

/*
 * Practice tools (PRD §7.4): find the phrases of a song, spot the ones that
 * repeat ("learn it once, play it twice"), and cut a section out to loop.
 */

export interface Phrase {
  readonly index: number;
  /** 1-based bar numbers, inclusive. */
  readonly firstBar: number;
  readonly lastBar: number;
  readonly startBeat: number;
  readonly endBeat: number;
  /** Same letter = same notes and rhythm. */
  readonly label: string;
  readonly noteCount: number;
}

export interface RepeatedPattern {
  readonly label: string;
  /** Phrase indexes where it occurs (≥ 2). */
  readonly occurrences: readonly number[];
}

function songEndBeat(song: SongDefinition): number {
  const last = Math.max(...song.notes.map((n) => n.startBeat + n.durationBeats));
  const bpb = song.timeSignature[0];
  return Math.ceil(last / bpb - 1e-9) * bpb;
}

/** Notes starting in [from, to), relative to `from`, as a comparable signature. */
function signature(notes: readonly SongNote[], from: number, to: number): string {
  return notes
    .filter((n) => n.startBeat >= from - 1e-9 && n.startBeat < to - 1e-9)
    .map((n) => `${n.midi}@${(n.startBeat - from).toFixed(3)}:${n.durationBeats.toFixed(3)}`)
    .sort()
    .join('|');
}

/** Split a song into phrases of `barsPerPhrase` bars and label identical ones. */
export function findPhrases(song: SongDefinition, barsPerPhrase = 4): Phrase[] {
  const bpb = song.timeSignature[0];
  const len = barsPerPhrase * bpb;
  const end = songEndBeat(song);
  const labels = new Map<string, string>();
  const phrases: Phrase[] = [];
  for (let start = 0, i = 0; start < end - 1e-9; start += len, i++) {
    const stop = Math.min(end, start + len);
    const sig = signature(song.notes, start, stop);
    if (!labels.has(sig)) labels.set(sig, String.fromCharCode(65 + labels.size));
    phrases.push({
      index: i,
      firstBar: start / bpb + 1,
      lastBar: Math.ceil(stop / bpb - 1e-9),
      startBeat: start,
      endBeat: stop,
      label: labels.get(sig)!,
      noteCount: song.notes.filter((n) => n.startBeat >= start && n.startBeat < stop).length,
    });
  }
  return phrases;
}

/** Phrases that occur more than once (repeated-pattern detection). */
export function repeatedPatterns(song: SongDefinition, barsPerPhrase = 4): RepeatedPattern[] {
  const byLabel = new Map<string, number[]>();
  for (const p of findPhrases(song, barsPerPhrase)) {
    if (p.noteCount === 0) continue;
    byLabel.set(p.label, [...(byLabel.get(p.label) ?? []), p.index]);
  }
  return [...byLabel.entries()].filter(([, occ]) => occ.length > 1).map(([label, occurrences]) => ({ label, occurrences }));
}

/**
 * A practice song: the beats [from, to) of `song`, looped `repeats` times.
 * Notes are cut to the section, the harmony (and any lead) comes along, and
 * memory fades are removed so the section is always fully visible.
 */
export function sliceSong(song: SongDefinition, fromBeat: number, toBeat: number, repeats = 3): SongDefinition {
  const len = toBeat - fromBeat;
  const within = (n: SongNote) => n.startBeat >= fromBeat - 1e-9 && n.startBeat < toBeat - 1e-9;
  const cut = (n: SongNote, loop: number): SongNote => ({
    ...n,
    startBeat: n.startBeat - fromBeat + loop * len,
    // Never let a note ring into the next loop (same-pitch overlap).
    durationBeats: Math.min(n.durationBeats, toBeat - n.startBeat),
  });
  const notes: SongNote[] = [];
  for (let loop = 0; loop < repeats; loop++) notes.push(...song.notes.filter(within).map((n) => cut(n, loop)));

  let backing: BackingSpec | undefined;
  if (song.backing) {
    const chords: [number, string][] = [];
    for (let loop = 0; loop < repeats; loop++) {
      chords.push([loop * len, chordAt(song.backing.chords, fromBeat)!]);
      for (const [b, c] of song.backing.chords) if (b > fromBeat && b < toBeat) chords.push([b - fromBeat + loop * len, c]);
    }
    const lead: SongNote[] = [];
    if (song.backing.lead) for (let loop = 0; loop < repeats; loop++) lead.push(...song.backing.lead.filter(within).map((n) => cut(n, loop)));
    backing = { ...song.backing, chords, ...(song.backing.lead ? { lead } : {}) };
  }

  const bpb = song.timeSignature[0];
  return {
    ...song,
    id: `${song.id}#bars${fromBeat / bpb + 1}-${Math.ceil(toBeat / bpb)}x${repeats}`,
    notes,
    assist: undefined,
    ...(backing ? { backing } : {}),
  };
}
