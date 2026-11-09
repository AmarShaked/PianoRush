import { useEffect, useState } from 'react';
import type { PianoSound } from '../../audio-engine/AudioEngine';
import { audioEngine } from '../inputs';

/** Re-render on sampled-piano download progress. */
export function useSampledPiano() {
  const piano = audioEngine.sampledPiano;
  const [, setTick] = useState(0);
  useEffect(() => piano.onChange(() => setTick((t) => t + 1)), [piano]);
  return { status: piano.status, progress: piano.progress };
}

interface PianoSoundPickerProps {
  value: PianoSound;
  onChange: (sound: PianoSound) => void;
}

/** Settings → Sound: which built-in piano to use, its download state, a preview and the sample credit. */
export function PianoSoundPicker({ value, onChange }: PianoSoundPickerProps) {
  const { status, progress } = useSampledPiano();

  const tryIt = () => {
    audioEngine.unlock();
    audioEngine.setPianoSound(value);
    const chord = [60, 64, 67, 72];
    chord.forEach((m, i) => setTimeout(() => audioEngine.pianoNoteOn(m, 70 + i * 10), i * 120));
    setTimeout(() => chord.forEach((m) => audioEngine.pianoNoteOff(m)), 1800);
  };

  return (
    <div className="field piano-sound">
      <span>Built-in piano</span>
      <div className="piano-sound-row">
        <select
          value={value}
          onChange={(e) => {
            const sound = e.target.value as PianoSound;
            onChange(sound);
            if (sound === 'grand') {
              audioEngine.unlock();
              audioEngine.setPianoSound(sound);
            }
          }}
        >
          <option value="grand">Grand piano (sampled)</option>
          <option value="synth">Light synth piano</option>
        </select>
        <button type="button" className="btn btn-ghost btn-small" onClick={tryIt}>
          ▶ Try it
        </button>
      </div>
      {value === 'grand' && (
        <small className={status === 'error' ? 'warn-text' : 'muted'}>
          {status === 'idle' && 'Downloads once (about 6 MB) the first time it plays, then works offline.'}
          {status === 'loading' && `Downloading the grand piano… ${Math.round(progress * 100)}%`}
          {status === 'ready' && 'Grand piano ready; works offline.'}
          {status === 'error' && "Couldn't download the grand piano, so the synth piano plays instead. It will retry next time."}
          <br />
          Samples: Salamander Grand Piano V3 by Alexander Holm (
          <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">
            CC BY 3.0
          </a>
          ).
        </small>
      )}
    </div>
  );
}
