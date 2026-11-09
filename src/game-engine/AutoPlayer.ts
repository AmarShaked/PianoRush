import type { PianoEvent } from '../piano-input/types';
import type { CompiledSong } from '../song-content/compile';
import type { GameEngine } from './GameEngine';

interface Action {
  readonly songMs: number;
  readonly type: 'noteOn' | 'noteOff';
  readonly midi: number;
}

/** Short notes are released a little early, so a repeated key gets a clean noteOff → noteOn. */
const RELEASE_GAP_MS = 40;

/** Round to the microsecond so a hold's end and the next note's start compare equal (float noise). */
const round = (ms: number) => Math.round(ms * 1000) / 1000;

/**
 * Listen mode: plays a song perfectly by feeding the engine noteOn / noteOff
 * events stamped with each note's exact time. The engine then lights the tiles
 * and keys exactly as it would for a real player, so the player can watch and
 * hear how the song goes. Call `update` once per frame, before the engine's own
 * update. Restarts are detected and replayed from the new position.
 */
export class AutoPlayer {
  private readonly actions: Action[];
  private cursor = 0;
  private lastSongMs = -Infinity;

  constructor(song: CompiledSong) {
    const actions: Action[] = [];
    for (const n of song.notes) {
      const release = n.isHold ? n.durationMs : Math.max(n.durationMs * 0.5, n.durationMs - RELEASE_GAP_MS);
      actions.push({ songMs: round(n.timeMs), type: 'noteOn', midi: n.midi });
      actions.push({ songMs: round(n.timeMs + release), type: 'noteOff', midi: n.midi });
    }
    // Releases before presses at the same instant (a key repeated back to back).
    this.actions = actions.sort((a, b) => a.songMs - b.songMs || (a.type === b.type ? 0 : a.type === 'noteOff' ? -1 : 1));
  }

  /** Feed every action that is due by clock time `now`. */
  update(engine: GameEngine, now: number): void {
    const state = engine.currentState;
    if (state !== 'playing' && state !== 'countdown') return;
    const songNow = engine.songTimeAt(now);
    if (songNow < this.lastSongMs - 1) this.cursor = 0; // restarted
    this.lastSongMs = songNow;
    while (this.cursor < this.actions.length && this.actions[this.cursor]!.songMs <= songNow) {
      const a = this.actions[this.cursor++]!;
      engine.handleInput(this.event(a, now - (songNow - a.songMs)));
    }
  }

  private event(a: Action, time: number): PianoEvent {
    return { type: a.type, note: a.midi, velocity: a.type === 'noteOn' ? 90 : 0, time, channel: 0, source: 'keyboard', deviceId: 'autoplay' };
  }
}
