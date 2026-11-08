import { KeyboardSimulator } from '../piano-input/KeyboardSimulator';
import { WebMidiManager } from '../piano-input/WebMidiManager';
import { AudioEngine } from '../audio-engine/AudioEngine';

/**
 * App-wide input adapters. They live for the lifetime of the page so the MIDI
 * connection and device selection survive screen changes and replays.
 */
export const midiManager = new WebMidiManager();
export const keyboardSimulator = new KeyboardSimulator();

/** App-wide audio engine (one AudioContext for the page's lifetime). */
export const audioEngine = new AudioEngine();

// Dev-only handle for automated browser checks (stripped from production builds).
if (import.meta.env.DEV) (globalThis as unknown as { __pianoRushAudio?: AudioEngine }).__pianoRushAudio = audioEngine;
