import { KeyboardSimulator } from '../piano-input/KeyboardSimulator';
import { WebMidiManager } from '../piano-input/WebMidiManager';

/**
 * App-wide input adapters. They live for the lifetime of the page so the MIDI
 * connection and device selection survive screen changes and replays.
 */
export const midiManager = new WebMidiManager();
export const keyboardSimulator = new KeyboardSimulator();
