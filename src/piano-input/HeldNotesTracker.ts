import type { PianoEvent } from './types';

export interface HeldNotesTrackerOptions {
  /**
   * A second noteOn for an already-held key arriving within this many ms of
   * the first is treated as a duplicate message and dropped. A later one is
   * accepted as a re-strike (some devices drop noteOff messages).
   */
  duplicateWindowMs?: number;
}

export const DEFAULT_DUPLICATE_WINDOW_MS = 30;

/**
 * Tracks which keys are physically held and filters an event stream so it is
 * well-formed: no duplicate noteOns, no orphan noteOffs.
 */
export class HeldNotesTracker {
  private readonly held = new Map<number, PianoEvent>();
  private readonly duplicateWindowMs: number;

  constructor(options: HeldNotesTrackerOptions = {}) {
    this.duplicateWindowMs = options.duplicateWindowMs ?? DEFAULT_DUPLICATE_WINDOW_MS;
  }

  /**
   * Feed a raw event. Returns the event if it should be forwarded, or null if
   * it is a duplicate / orphan and must be ignored.
   */
  process(event: PianoEvent): PianoEvent | null {
    const existing = this.held.get(event.note);
    if (event.type === 'noteOn') {
      if (existing && event.time - existing.time < this.duplicateWindowMs) {
        return null;
      }
      this.held.set(event.note, event);
      return event;
    }
    if (!existing) return null; // noteOff for a key we never saw go down
    this.held.delete(event.note);
    return event;
  }

  isHeld(note: number): boolean {
    return this.held.has(note);
  }

  heldNotes(): number[] {
    return [...this.held.keys()].sort((a, b) => a - b);
  }

  /**
   * Clear all held keys, returning synthetic noteOff events for each (used on
   * device disconnect or window blur so nothing stays "stuck").
   */
  releaseAll(time: number): PianoEvent[] {
    const releases: PianoEvent[] = [];
    for (const on of this.held.values()) {
      releases.push({ ...on, type: 'noteOff', velocity: 0, time });
    }
    this.held.clear();
    return releases.sort((a, b) => a.note - b.note);
  }
}
