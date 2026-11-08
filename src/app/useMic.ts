import { useCallback, useEffect, useState } from 'react';
import { microphoneInput, audioEngine } from './inputs';
import type { MicStatus } from '../piano-input/MicrophoneInput';

export interface MicState {
  status: MicStatus;
  level: number;
  lastNote: number | null;
  start: () => Promise<void>;
  stop: () => void;
}

/** React binding for the microphone input (status, live level meter, last note). */
export function useMic(): MicState {
  const [status, setStatus] = useState<MicStatus>(microphoneInput.status);
  const [level, setLevel] = useState(0);
  const [lastNote, setLastNote] = useState<number | null>(null);

  useEffect(() => microphoneInput.onChange(() => setStatus(microphoneInput.status)), []);
  useEffect(() => {
    if (status !== 'listening') return;
    const id = setInterval(() => {
      setLevel(microphoneInput.level);
      setLastNote(microphoneInput.lastNote);
    }, 100);
    return () => clearInterval(id);
  }, [status]);

  const start = useCallback(async () => {
    // Called from a click: unlock audio and open the microphone together.
    if (!(await audioEngine.ready()) || !audioEngine.context) return;
    await microphoneInput.start(audioEngine.context);
  }, []);
  const stop = useCallback(() => microphoneInput.stop(), []);
  return { status, level, lastNote, start, stop };
}
