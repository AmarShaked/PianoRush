import { useMemo, useState } from 'react';
import { parseSmf, type SmfFile } from '../../song-content/midi/smf';
import { midiToSong, suggestMelodyTrack, summarizeTracks, type ImportOptions, type ImportResult } from '../../song-content/midi/convert';
import type { BackingStyle, Hand, SongDefinition } from '../../song-content/schema';
import { midiToNoteName } from '../../piano-input/noteNames';
import { MiniKeyboard } from '../components/MiniKeyboard';
import { audioEngine } from '../inputs';
import { saveMySong } from '../library';

interface ImportScreenProps {
  onSaved: () => void;
  onCancel: () => void;
}

const STYLES: BackingStyle[] = ['pop', 'dance', 'groove', 'straight', 'gentle', 'waltz'];

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'song';
}

/**
 * Import a licensed song from a MIDI file into "My Songs" (stored only in this
 * browser), optionally with a recorded backing track. Requires a licence
 * reference and an explicit rights confirmation.
 */
export function ImportScreen({ onSaved, onCancel }: ImportScreenProps) {
  const [smf, setSmf] = useState<SmfFile | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<number[]>([]);
  const [title, setTitle] = useState('');
  const [credit, setCredit] = useState('');
  const [holder, setHolder] = useState('ACUM');
  const [reference, setReference] = useState('');
  const [territory, setTerritory] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [hand, setHand] = useState<Hand | 'both'>('right');
  const [keepChords, setKeepChords] = useState(false);
  const [grid, setGrid] = useState(0.5);
  const [fromBar, setFromBar] = useState('');
  const [toBar, setToBar] = useState('');
  const [transpose, setTranspose] = useState<'auto' | number>('auto');
  const [style, setStyle] = useState<BackingStyle>('pop');
  const [audio, setAudio] = useState<File | null>(null);
  const [audioOffset, setAudioOffset] = useState(0);
  const [saving, setSaving] = useState(false);

  async function onMidi(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const parsed = parseSmf(await file.arrayBuffer());
      setSmf(parsed);
      setFileName(file.name);
      const melody = suggestMelodyTrack(parsed);
      setTracks(melody === null ? [] : [melody]);
      setTitle(file.name.replace(/\.midi?$/i, '').replace(/[_-]+/g, ' ').trim());
    } catch (e) {
      setSmf(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const summaries = useMemo(() => (smf ? summarizeTracks(smf) : []), [smf]);
  const options: ImportOptions | null =
    smf && tracks.length
      ? {
          id: `my-${slug(title)}-${Date.now().toString(36)}`,
          title: title || 'Imported song',
          credit: credit || 'Licensed song',
          playerTracks: tracks,
          hand,
          keepChords,
          grid,
          fromBar: fromBar ? Number(fromBar) : undefined,
          toBar: toBar ? Number(toBar) : undefined,
          transpose,
          style,
          audio: audio ? { url: 'local', offsetMs: audioOffset } : undefined,
        }
      : null;
  const preview: ImportResult | { error: string } | null = useMemo(() => {
    if (!smf || !options) return null;
    try {
      return midiToSong(smf, options);
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
    // options is rebuilt each render; depend on its inputs instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smf, tracks, hand, keepChords, grid, fromBar, toBar, transpose, style, audio, audioOffset, title, credit]);
  const result = preview && 'song' in preview ? preview : null;
  const canSave = !!result && confirmed && reference.trim().length > 0 && !saving;

  /** Listen to the first bars of a track (built-in piano) to find the melody. */
  function listen(trackIndex: number) {
    if (!smf) return;
    audioEngine.unlock();
    const track = smf.tracks.find((t) => t.index === trackIndex);
    if (!track || !audioEngine.context) return;
    const tpq = smf.ticksPerQuarter;
    const msPerBeat = smf.tempos[0] ? smf.tempos[0].usPerQuarter / 1000 : 500;
    const first = track.notes[0]?.tick ?? 0;
    const start = performance.now() + 100;
    for (const n of track.notes) {
      const beat = (n.tick - first) / tpq;
      if (beat > 16) break;
      const at = start + beat * msPerBeat;
      setTimeout(() => audioEngine.pianoNoteOn(n.midi, Math.max(40, n.velocity)), at - performance.now());
      setTimeout(() => audioEngine.pianoNoteOff(n.midi), at + (n.durationTicks / tpq) * msPerBeat - performance.now());
    }
  }

  async function save() {
    if (!result || !canSave) return;
    setSaving(true);
    const song: SongDefinition = {
      ...result.song,
      license: { holder: holder.trim(), reference: reference.trim(), ...(territory.trim() ? { territory: territory.trim() } : {}) },
    };
    await saveMySong({ id: song.id, song, ...(audio ? { audio } : {}), addedAt: Date.now() });
    setSaving(false);
    onSaved();
  }

  function exportPack() {
    if (!result) return;
    const song: SongDefinition = {
      ...result.song,
      license: { holder: holder.trim(), reference: reference.trim(), ...(territory.trim() ? { territory: territory.trim() } : {}) },
      ...(audio && result.song.backing
        ? { backing: { ...result.song.backing, audio: { url: `licensed/${audio.name}`, offsetMs: audioOffset } } }
        : {}),
    };
    const pack = { title: 'Licensed songs', license: song.license, songs: [song] };
    const url = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(song.title)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="screen import-screen">
      <header className="diag-header">
        <button className="btn btn-ghost" onClick={onCancel}>
          ← Back
        </button>
        <h1>Import a licensed song</h1>
      </header>

      <div className="diag-grid">
        <section className="card">
          <h2>1 · MIDI file</h2>
          <input type="file" accept=".mid,.midi,audio/midi" onChange={(e) => void onMidi(e.target.files?.[0])} />
          {error && <p className="msg warn">{error}</p>}
          {smf && (
            <>
              <p className="small muted">
                {fileName} · {summaries.length} tracks. Tick the part you want to play — use ▶ to listen.
              </p>
              <ul className="track-list">
                {summaries.map((t) => (
                  <li key={t.index} className={t.isDrums ? 'muted' : ''}>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        disabled={t.isDrums}
                        checked={tracks.includes(t.index)}
                        onChange={(e) => setTracks((cur) => (e.target.checked ? [...cur, t.index] : cur.filter((i) => i !== t.index)))}
                      />
                      <span>
                        <b>{t.name}</b>{' '}
                        <span className="small muted">
                          {t.noteCount} notes · {midiToNoteName(t.low)}–{midiToNoteName(t.high)}
                          {t.isDrums ? ' · drums' : t.chordiness > 0.5 ? ' · chords' : ' · single line'}
                        </span>
                      </span>
                    </label>
                    {!t.isDrums && (
                      <button className="link-btn inline" onClick={() => listen(t.index)}>
                        ▶ listen
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2>2 · Song &amp; licence</h2>
          <label className="field">
            <span>Title</span>
            <input className="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>Credit (composer / publisher)</span>
            <input className="text" value={credit} onChange={(e) => setCredit(e.target.value)} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Licensed through</span>
              <input className="text" value={holder} onChange={(e) => setHolder(e.target.value)} />
            </label>
            <label className="field">
              <span>Licence reference *</span>
              <input className="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. 12345/2026" />
            </label>
            <label className="field">
              <span>Territory</span>
              <input className="text" value={territory} onChange={(e) => setTerritory(e.target.value)} placeholder="e.g. Israel" />
            </label>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span className="small">
              I confirm I hold the rights to use this song (and recording, if attached) in Piano Rush for where I use it — including any
              licence the MIDI arrangement itself requires.
            </span>
          </label>
        </section>

        <section className="card">
          <h2>3 · Make it playable</h2>
          <div className="field-row">
            <label className="field">
              <span>Hand</span>
              <select value={hand} onChange={(e) => setHand(e.target.value as Hand | 'both')}>
                <option value="right">Right hand</option>
                <option value="left">Left hand</option>
                <option value="both">Both (split at middle C)</option>
              </select>
            </label>
            <label className="field">
              <span>Rhythm grid</span>
              <select value={grid} onChange={(e) => setGrid(Number(e.target.value))}>
                <option value={1}>Quarter notes (easiest)</option>
                <option value={0.5}>Eighth notes</option>
                <option value={0.25}>Sixteenths (exact)</option>
              </select>
            </label>
            <label className="field">
              <span>Backing style</span>
              <select value={style} onChange={(e) => setStyle(e.target.value as BackingStyle)}>
                {STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>From bar</span>
              <input className="text" type="number" min={1} value={fromBar} onChange={(e) => setFromBar(e.target.value)} placeholder="1" />
            </label>
            <label className="field">
              <span>To bar</span>
              <input className="text" type="number" min={1} value={toBar} onChange={(e) => setToBar(e.target.value)} placeholder="end" />
            </label>
            <label className="field">
              <span>Transpose</span>
              <select value={String(transpose)} onChange={(e) => setTranspose(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}>
                <option value="auto">Auto (best octave)</option>
                {[-12, -7, -5, -2, -1, 0, 1, 2, 5, 7, 12].map((t) => (
                  <option key={t} value={t}>
                    {t > 0 ? `+${t}` : t} semitones
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={keepChords} onChange={(e) => setKeepChords(e.target.checked)} />
            <span>Keep chords (up to 3 notes) instead of the top line only</span>
          </label>
          <label className="field">
            <span>Recorded backing track (optional, licensed recording)</span>
            <input type="file" accept="audio/*" onChange={(e) => setAudio(e.target.files?.[0] ?? null)} />
          </label>
          {audio && (
            <label className="field">
              <span>
                Bar 1 starts at <b>{audioOffset} ms</b> in the recording
              </span>
              <input type="range" min={0} max={20000} step={10} value={audioOffset} onChange={(e) => setAudioOffset(Number(e.target.value))} />
            </label>
          )}

          <h3>Preview</h3>
          {!preview && <p className="muted small">Choose a MIDI file and a track.</p>}
          {preview && 'error' in preview && <p className="msg warn">{preview.error}</p>}
          {result && (
            <>
              <p className="small">
                {result.stats.notes} notes · {result.stats.lanes} keys · {result.stats.bars} bars · {Math.round(result.stats.seconds)} s ·{' '}
                {result.song.bpm} BPM · {result.song.timeSignature.join('/')} · {result.stats.key}
                {result.stats.transpose ? ` · moved ${result.stats.transpose > 0 ? '+' : ''}${result.stats.transpose}` : ''}
              </p>
              <MiniKeyboard className="guide-keyboard" from={36} to={95} lanes={result.song.lanes} />
              <p className="small muted">
                Chords: {result.song.backing!.chords.slice(0, 10).map(([, c]) => c).join(' · ')}
                {result.song.backing!.chords.length > 10 ? ' …' : ''}
              </p>
              {result.warnings.map((w) => (
                <p key={w} className="msg warn small">
                  {w}
                </p>
              ))}
            </>
          )}
          <div className="overlay-actions">
            <button className="btn btn-primary" disabled={!canSave} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save to My Songs'}
            </button>
            <button className="btn btn-secondary" disabled={!result || !confirmed || !reference.trim()} onClick={exportPack}>
              Export pack file (for your own builds)
            </button>
          </div>
          {!confirmed || !reference.trim() ? <p className="small muted center">A licence reference and the rights confirmation are required.</p> : null}
        </section>
      </div>
    </main>
  );
}
