import { describe, expect, it } from 'vitest';
import { PianoKeys } from './sustain';

describe('built-in piano keys and sustain pedal', () => {
  it('releases a note with its key when the pedal is up', () => {
    const keys = new PianoKeys<string>();
    keys.noteOn(60, 'c');
    expect(keys.noteOff(60)).toBe('c');
    expect(keys.noteOff(60)).toBeUndefined();
  });

  it('keeps notes ringing while the pedal is down, then releases them when it lifts', () => {
    const keys = new PianoKeys<string>();
    keys.setPedal(true);
    keys.noteOn(60, 'c');
    keys.noteOn(64, 'e');
    expect(keys.noteOff(60)).toBeUndefined();
    expect(keys.noteOff(64)).toBeUndefined();
    expect(keys.sustainedCount).toBe(2);
    expect(keys.setPedal(false).sort()).toEqual(['c', 'e']);
    expect(keys.sustainedCount).toBe(0);
  });

  it('keeps notes whose keys are still held when the pedal lifts', () => {
    const keys = new PianoKeys<string>();
    keys.setPedal(true);
    keys.noteOn(60, 'c');
    keys.noteOn(67, 'g');
    keys.noteOff(60);
    expect(keys.setPedal(false)).toEqual(['c']);
    expect(keys.noteOff(67)).toBe('g');
  });

  it('catches notes already held when the pedal goes down (legato pedalling)', () => {
    const keys = new PianoKeys<string>();
    keys.noteOn(60, 'c');
    keys.setPedal(true);
    expect(keys.noteOff(60)).toBeUndefined();
    expect(keys.setPedal(false)).toEqual(['c']);
  });

  it('re-striking a sustained key replaces its note', () => {
    const keys = new PianoKeys<string>();
    keys.setPedal(true);
    keys.noteOn(60, 'c1');
    keys.noteOff(60);
    expect(keys.noteOn(60, 'c2')).toBe('c1');
    keys.noteOff(60);
    expect(keys.setPedal(false)).toEqual(['c2']);
  });

  it('clears everything, including the pedal', () => {
    const keys = new PianoKeys<string>();
    keys.setPedal(true);
    keys.noteOn(60, 'c');
    keys.noteOff(60);
    expect(keys.clear()).toEqual(['c']);
    expect(keys.pedalDown).toBe(false);
  });
});
