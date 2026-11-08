import { KeyboardSimulator } from '../piano-input/KeyboardSimulator';
import { WebMidiManager } from '../piano-input/WebMidiManager';
import { AudioEngine } from '../audio-engine/AudioEngine';
import { MicrophoneInput } from '../piano-input/MicrophoneInput';
import { NativeMidiBridge } from '../piano-input/NativeMidiBridge';

/**
 * App-wide input adapters. They live for the lifetime of the page so the MIDI
 * connection and device selection survive screen changes and replays.
 */
export const midiManager = new WebMidiManager();
export const keyboardSimulator = new KeyboardSimulator();
/** Acoustic piano via the microphone (beta, one note at a time). */
export const microphoneInput = new MicrophoneInput();

/** MIDI from a native app wrapper (iOS/Android), exposed as window.PianoRushNative. */
export const nativeMidi = new NativeMidiBridge();
if (typeof window !== 'undefined') nativeMidi.install();

/** App-wide audio engine (one AudioContext for the page's lifetime). */
export const audioEngine = new AudioEngine();

// Dev-only handle for automated browser checks (stripped from production builds).
if (import.meta.env.DEV) (globalThis as unknown as { __pianoRushAudio?: AudioEngine }).__pianoRushAudio = audioEngine;
