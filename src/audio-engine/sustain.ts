/**
 * Key and sustain-pedal bookkeeping for the built-in piano, kept pure so it
 * can be tested without audio. Like a real piano:
 *  - releasing a key stops its note, unless the sustain pedal is down;
 *  - lifting the pedal stops every note whose key is no longer held;
 *  - striking a key again replaces its sounding note (one string per key).
 */
export class PianoKeys<V> {
  private readonly sounding = new Map<number, V>();
  private readonly held = new Set<number>();
  private pedal = false;

  get pedalDown(): boolean {
    return this.pedal;
  }

  /** Notes still sounding only because of the pedal. */
  get sustainedCount(): number {
    let n = 0;
    for (const midi of this.sounding.keys()) if (!this.held.has(midi)) n++;
    return n;
  }

  /** Returns the voice this key was already sounding (to cut off), if any. */
  noteOn(midi: number, voice: V): V | undefined {
    const previous = this.sounding.get(midi);
    this.sounding.set(midi, voice);
    this.held.add(midi);
    return previous;
  }

  /** Returns the voice to release now; undefined while the pedal holds it. */
  noteOff(midi: number): V | undefined {
    this.held.delete(midi);
    if (this.pedal) return undefined;
    const voice = this.sounding.get(midi);
    this.sounding.delete(midi);
    return voice;
  }

  /** Returns the voices to release (pedal lifted: every note whose key is up). */
  setPedal(down: boolean): V[] {
    this.pedal = down;
    if (down) return [];
    const released: V[] = [];
    for (const [midi, voice] of this.sounding) {
      if (this.held.has(midi)) continue;
      released.push(voice);
      this.sounding.delete(midi);
    }
    return released;
  }

  /** Forget everything (end of a level); returns every sounding voice. */
  clear(): V[] {
    const all = [...this.sounding.values()];
    this.sounding.clear();
    this.held.clear();
    this.pedal = false;
    return all;
  }
}
