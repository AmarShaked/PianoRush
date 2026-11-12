import type { BackingPart } from '../audio-engine/arranger';

/** What your keys play in the Loop Studio. */
export type LoopInstrument = 'drums' | 'bass' | 'piano' | 'keys' | 'pad' | 'lead';

export interface InstrumentInfo {
  readonly id: LoopInstrument;
  readonly emoji: string;
  readonly label: string;
  readonly color: string;
  readonly shade: string;
}

export const INSTRUMENTS: readonly InstrumentInfo[] = [
  { id: 'drums', emoji: '🥁', label: 'Drums', color: '#ff5d8f', shade: '#c93a6a' },
  { id: 'bass', emoji: '🎸', label: 'Bass', color: '#ff9f1c', shade: '#c47406' },
  { id: 'piano', emoji: '🎹', label: 'Piano', color: '#4cc9f0', shade: '#2190b8' },
  { id: 'keys', emoji: '✨', label: 'Keys', color: '#2fcf7a', shade: '#1c9a57' },
  { id: 'pad', emoji: '🌌', label: 'Pad', color: '#7b6cff', shade: '#5244d1' },
  { id: 'lead', emoji: '🎺', label: 'Lead', color: '#f5b82e', shade: '#b8860f' },
];

export const instrumentInfo = (id: LoopInstrument): InstrumentInfo => INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0]!;

export type DrumSound = 'kick' | 'snare' | 'rim' | 'clap' | 'hat' | 'openhat' | 'tomlow' | 'tommid' | 'tomhigh' | 'crash';

/**
 * Drum kit on the keys, by note name, so it works in every octave of any
 * keyboard. It follows General MIDI where it can (C kick, D snare, F♯ closed
 * hat, A♯ open hat, D♯ clap), so drum pads that send GM notes play the
 * sound printed on them.
 */
const DRUM_BY_PITCH_CLASS: readonly DrumSound[] = [
  'kick', // C
  'rim', // C♯
  'snare', // D
  'clap', // D♯
  'snare', // E (GM electric snare)
  'tomlow', // F
  'hat', // F♯
  'tommid', // G
  'hat', // G♯ (GM pedal hi-hat)
  'tomhigh', // A
  'openhat', // A♯
  'crash', // B
];

export const DRUM_LABEL: Readonly<Record<DrumSound, string>> = {
  kick: 'Kick',
  snare: 'Snare',
  rim: 'Rim',
  clap: 'Clap',
  hat: 'Hi-hat',
  openhat: 'Open hat',
  tomlow: 'Low tom',
  tommid: 'Mid tom',
  tomhigh: 'High tom',
  crash: 'Crash',
};

export function drumFor(midi: number): DrumSound {
  return DRUM_BY_PITCH_CLASS[((midi % 12) + 12) % 12]!;
}

/** MIDI channel 10 (index 9) is the drum channel: pads on most controllers send there. */
export const DRUM_CHANNEL = 9;

/** The audio part that sounds a note of an instrument (drums pick the kit piece from the note). */
export function partFor(instrument: LoopInstrument, midi: number): { part: BackingPart; midi?: number } {
  switch (instrument) {
    case 'drums': {
      const drum = drumFor(midi);
      if (drum === 'tomlow' || drum === 'tommid' || drum === 'tomhigh') return { part: 'tom', midi: drum === 'tomlow' ? 45 : drum === 'tommid' ? 50 : 55 };
      return { part: drum };
    }
    case 'bass':
      // Bass sounds an octave below where it's played, so it can be played in the middle of a small keyboard.
      return { part: 'bass', midi: midi - 12 };
    case 'piano':
      return { part: 'melody', midi };
    case 'keys':
      return { part: 'keys', midi };
    case 'pad':
      return { part: 'pad', midi };
    case 'lead':
      return { part: 'lead', midi };
  }
}
