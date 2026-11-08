import { isHighLatency } from '../audio-engine/calibration';
import { audioEngine, microphoneInput, midiManager, nativeMidi } from './inputs';
import type { Settings } from './storage';

/*
 * Calibration is stored per device configuration (PRD §6.4): which input is
 * used (a named MIDI device, the computer keyboard, or the microphone) and
 * whether the audio output is a low-latency (wired/built-in) or high-latency
 * (wireless/Bluetooth) one.
 */

export function inputKey(): string {
  if (midiManager.isListening) return `midi:${midiManager.getDeviceName() ?? 'MIDI device'}`;
  if (nativeMidi.isActive) return `midi:${nativeMidi.deviceNames[0] ?? 'Native MIDI'}`;
  if (microphoneInput.status === 'listening') return 'microphone';
  return 'keyboard';
}

export function outputKey(): 'wired' | 'wireless' {
  return isHighLatency(audioEngine.latency?.output ?? null) ? 'wireless' : 'wired';
}

export function configKey(): string {
  return `${inputKey()}|${outputKey()}`;
}

/** The input offset to use now: this configuration's calibration, else the default. */
export function offsetFor(settings: Settings, key = configKey()): number {
  return settings.calibrations[key] ?? settings.inputOffsetMs;
}

export function describeConfig(key: string): string {
  const [input = '', output = 'wired'] = key.split('|');
  const name = input.startsWith('midi:') ? input.slice(5) : input === 'microphone' ? 'Microphone' : 'Computer keyboard';
  return `${name} · ${output === 'wireless' ? 'wireless audio' : 'wired audio'}`;
}
