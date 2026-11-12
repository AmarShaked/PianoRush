import { useEffect, useState } from 'react';
import { DEFAULT_KEY_MAP, keyLabel } from '../../piano-input/KeyboardSimulator';
import { findPhrases, repeatedPatterns } from '../../song-content/practice';
import type { GameMode, LevelDefinition } from '../../song-content/level';
import type { LevelProgress } from '../../game-engine/progression';
import type { PracticeSection } from '../catalog';
import type { Settings } from '../storage';
import { MiniKeyboard } from './MiniKeyboard';
import { Stars } from './Stars';
import { lookStyle, type WorldLook } from './worldLook';

interface LevelSheetProps {
  level: LevelDefinition;
  look: WorldLook;
  /** Small line above the title, e.g. "Level 3 · First Touch". */
  label: string;
  progress: LevelProgress | undefined;
  unlocked: boolean;
  /** Why the level is locked, in kid words. */
  lockedText: string;
  hasInput: boolean;
  /** Microphone input and the level has chords. */
  chordWarning: boolean;
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onListen: () => void;
  onPlay: (mode: GameMode) => void;
  onPracticeSection: (section: PracticeSection) => void;
  onConnect: () => void;
  onClose: () => void;
  /** Imported songs can be removed. */
  onDelete?: () => void;
}

const KEY_HINTS: Record<number, string> = Object.fromEntries(Object.entries(DEFAULT_KEY_MAP).map(([code, note]) => [note, keyLabel(code)]));

const SPEEDS: ReadonlyArray<{ speed: number; icon: string; label: string }> = [
  { speed: 0.5, icon: '🐢', label: 'Slow' },
  { speed: 0.75, icon: '🚶', label: 'Medium' },
  { speed: 1, icon: '🐇', label: 'Normal' },
];

/**
 * The card that opens when you tap a level: big Listen / Learn / Play buttons,
 * with speed, the play-along helper and section practice tucked under "More".
 */
export function LevelSheet(props: LevelSheetProps) {
  const { level, look, label, progress, unlocked, lockedText, hasInput, chordWarning, settings, onSettingsChange } = props;
  const { onListen, onPlay, onPracticeSection, onConnect, onClose, onDelete } = props;
  const practice = settings.practiceSpeed < 1 || settings.melodyGuide;
  const [more, setMore] = useState(practice);
  const canPlay = unlocked && hasInput;
  const song = level.song;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" style={lookStyle(look)}>
        <button className="sheet-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="sheet-head">
          <div className="sheet-badge" aria-hidden>
            {unlocked ? (level.world > 0 ? level.number : look.emoji) : '🔒'}
          </div>
          <div>
            <div className="sheet-label">{label}</div>
            <h2 id="sheet-title" className="sheet-title">
              {level.title}
            </h2>
            <p className="sheet-goal">{level.world > 0 ? level.objective : song.composer}</p>
          </div>
          {progress && progress.bestScore > 0 && (
            <div className="sheet-best">
              <Stars count={progress.bestStars} />
              {progress.challengeCleared && <span aria-label="Challenge cleared">🏆</span>}
            </div>
          )}
        </div>

        <MiniKeyboard
          className="sheet-keyboard"
          from={Math.min(48, Math.floor(Math.min(...song.lanes) / 12) * 12)}
          to={Math.max(83, Math.ceil((Math.max(...song.lanes) + 1) / 12) * 12 - 1)}
          lanes={song.lanes}
          keyHints={settings.keyboardSimulator ? KEY_HINTS : {}}
          preferFlats={song.preferFlats}
        />

        {!unlocked && <p className="sheet-note">🔒 {lockedText}</p>}
        {unlocked && !hasInput && (
          <button className="sheet-note sheet-note-btn" onClick={onConnect}>
            🔌 Connect your piano first — tap here
          </button>
        )}

        <div className="big-actions">
          <button className="big-action action-listen" onClick={onListen}>
            <span className="big-icon" aria-hidden>
              👂
            </span>
            <span className="big-name">Listen</span>
            <span className="big-text">Hear the song</span>
          </button>
          {level.modes.includes('discover') && (
            <button className="big-action action-learn" onClick={() => onPlay('discover')} disabled={!canPlay}>
              <span className="big-icon" aria-hidden>
                🐢
              </span>
              <span className="big-name">Learn</span>
              <span className="big-text">The song waits for you</span>
            </button>
          )}
          <button className="big-action action-play" onClick={() => onPlay('flow')} disabled={!canPlay} autoFocus={canPlay}>
            <span className="big-icon" aria-hidden>
              ▶
            </span>
            <span className="big-name">Play</span>
            <span className="big-text">{practice ? 'Practice' : 'Win stars ⭐'}</span>
          </button>
        </div>

        <div className="sheet-extras">
          {level.modes.includes('challenge') && (
            <button className="pill" onClick={() => onPlay('challenge')} disabled={!canPlay}>
              🏆 Challenge
            </button>
          )}
          <button className={`pill${more ? ' active' : ''}`} onClick={() => setMore((m) => !m)} aria-expanded={more}>
            ⚙️ More {practice ? '•' : ''}
          </button>
        </div>

        {more && (
          <div className="sheet-more">
            <div className="option-row" role="radiogroup" aria-label="Speed">
              <span className="option-label">Speed</span>
              {SPEEDS.map((s) => (
                <button
                  key={s.speed}
                  role="radio"
                  aria-checked={settings.practiceSpeed === s.speed}
                  className={`pill${settings.practiceSpeed === s.speed ? ' active' : ''}`}
                  onClick={() => onSettingsChange({ practiceSpeed: s.speed })}
                >
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
            <div className="option-row">
              <span className="option-label">Helper</span>
              <button
                className={`pill${settings.melodyGuide ? ' active' : ''}`}
                role="switch"
                aria-checked={settings.melodyGuide}
                onClick={() => onSettingsChange({ melodyGuide: !settings.melodyGuide })}
              >
                🎹 Piano plays along {settings.melodyGuide ? 'ON' : 'OFF'}
              </button>
            </div>
            {practice && <p className="option-hint">Slow speed and the helper are for practice — play at 🐇 Normal with the helper off to win stars.</p>}
            <SectionPractice level={level} disabled={!canPlay} onPick={onPracticeSection} />
            {song.license && (
              <p className="option-hint">
                Licensed: {song.license.holder} {song.license.reference}
                {song.license.territory ? ` · ${song.license.territory}` : ''}
              </p>
            )}
            {onDelete && (
              <button className="link-btn" onClick={onDelete}>
                Remove “{level.title}” from My Songs
              </button>
            )}
          </div>
        )}
        {chordWarning && <p className="option-hint center">This song has chords — the microphone hears one note at a time. A MIDI piano works best.</p>}
      </section>
    </div>
  );
}

/** "Practice a part": loop one phrase three times (practice, no stars). */
function SectionPractice({ level, disabled, onPick }: { level: LevelDefinition; disabled: boolean; onPick: (s: PracticeSection) => void }) {
  const phrases = findPhrases(level.song).filter((p) => p.noteCount > 0);
  const repeats = repeatedPatterns(level.song);
  if (phrases.length < 2) return null;
  return (
    <div className="option-row option-wrap">
      <span className="option-label">Practice a part</span>
      {phrases.map((p) => (
        <button
          key={p.index}
          className="pill"
          disabled={disabled}
          onClick={() => onPick({ fromBeat: p.startBeat, toBeat: p.endBeat, firstBar: p.firstBar, lastBar: p.lastBar, repeats: 3 })}
          aria-label={`Loop bars ${p.firstBar} to ${p.lastBar}, part ${p.label}, three times`}
        >
          {p.label} <span className="pill-sub">bars {p.firstBar}–{p.lastBar}</span>
        </button>
      ))}
      {repeats.length > 0 && <p className="option-hint">{repeats.map((r) => `Part ${r.label} comes ${r.occurrences.length} times`).join(' · ')} — learn it once!</p>}
    </div>
  );
}
