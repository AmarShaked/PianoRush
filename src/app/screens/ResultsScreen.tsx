import type { GameResults } from '../../game-engine/GameEngine';
import type { ProgressUpdate, RunOutcome } from '../../game-engine/progression';
import type { GameMode, LevelDefinition } from '../../song-content/level';
import { Stars } from '../components/Stars';
import type { PracticeSection } from '../catalog';
import { MODE_LABEL } from './GameScreen';

interface ResultsScreenProps {
  level: LevelDefinition;
  mode: GameMode;
  speed: number;
  /** Played with the melody guide (practice). */
  guided?: boolean;
  section?: PracticeSection | null;
  results: GameResults;
  outcome: RunOutcome;
  update: ProgressUpdate;
  nextLevel: LevelDefinition | null;
  onRetry: () => void;
  onPlayMode: (mode: GameMode, speed: number) => void;
  onNext: () => void;
  onMenu: () => void;
}

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

function offsetAdvice(mean: number | null): string | null {
  if (mean === null || Math.abs(mean) < 25) return null;
  const ms = Math.round(Math.abs(mean));
  return mean > 0
    ? `On average you played ${ms} ms late. If that felt on time, try a positive input offset in Settings.`
    : `On average you played ${ms} ms early — try waiting for the tile to touch the line.`;
}

/** The big cheer at the top: kid words for how the run went. */
function cheer(practice: boolean, outcome: RunOutcome): { emoji: string; title: string } {
  if (practice) return { emoji: '🎉', title: 'Nice practice!' };
  if (!outcome.completed) return { emoji: '💪', title: 'Almost there!' };
  if (outcome.stars >= 3) return { emoji: '🤩', title: 'Amazing!' };
  if (outcome.stars === 2) return { emoji: '🎉', title: 'Great job!' };
  return { emoji: '👏', title: 'Well done!' };
}

export function ResultsScreen(props: ResultsScreenProps) {
  const { level, mode, speed, section = null, guided = false, results, outcome, update, nextLevel, onRetry, onPlayMode, onNext, onMenu } = props;
  const discover = mode === 'discover';
  const slowed = !discover && (speed < 1 || section !== null || guided);
  const practice = discover || slowed;
  const advice = discover ? null : offsetAdvice(results.meanOffsetMs);
  const newChallenge = mode === 'challenge' && outcome.completed && !update.previous.challengeCleared;
  const canGoNext = nextLevel !== null && update.current.completed;
  const hit = results.counts.perfect + results.counts.great + results.counts.good;
  const { emoji, title } = cheer(practice, outcome);

  const rows: Array<[string, number, string]> = [
    ['Perfect', results.counts.perfect, 'perfect'],
    ['Great', results.counts.great, 'great'],
    ['Good', results.counts.good, 'good'],
    ['Miss', results.counts.miss, 'miss'],
  ];

  return (
    <main className="screen results-screen">
      <section className="card results-card" aria-labelledby="results-title">
        <div className="cheer-emoji" aria-hidden>
          {emoji}
        </div>
        <h1 id="results-title" className="cheer-title">
          {title}
        </h1>
        <p className="results-level">{level.world > 0 ? `Level ${level.number} · ${level.title}` : level.title}</p>

        {outcome.ranked && <Stars count={outcome.stars} animate />}

        <p className="results-line">
          You played <b>{hit}</b> of <b>{results.totalEvents}</b> notes right!
        </p>

        {(update.unlockedNext || newChallenge || update.newBestScore || practice || (outcome.ranked && !outcome.completed)) && (
          <div className="result-messages">
            {update.unlockedNext && nextLevel && <p className="msg ok">🔓 New level: “{nextLevel.title}”!</p>}
            {newChallenge && <p className="msg ok">🏆 Challenge cleared!</p>}
            {update.newBestScore && outcome.ranked && <p className="msg ok">🏅 New best score: {results.score.toLocaleString()}</p>}
            {practice && (
              <p className="msg">
                {discover
                  ? 'You learned the notes! Now press Play to win stars.'
                  : guided && speed === 1 && !section
                    ? 'Now try it on your own, without the helper, to win stars.'
                    : 'Now try the whole song at normal speed to win stars.'}
              </p>
            )}
            {outcome.ranked && !outcome.completed && (
              <p className="msg warn">
                Play {Math.round(level.completion.minNoteAccuracy * 100)}% of the notes right to finish. Try 🐢 Learn — the song waits for
                you!
              </p>
            )}
          </div>
        )}

        <div className="results-actions">
          {canGoNext && (
            <button className="btn btn-primary btn-big" onClick={onNext} autoFocus>
              Next level ▶
            </button>
          )}
          {practice && (
            <button className={`btn btn-big ${canGoNext ? 'btn-secondary' : 'btn-primary'}`} onClick={() => onPlayMode('flow', 1)} autoFocus={!canGoNext}>
              ▶ Play for stars
            </button>
          )}
          <div className="results-row">
            <button className={`btn ${canGoNext || practice ? 'btn-secondary' : 'btn-primary'}`} onClick={onRetry} autoFocus={!canGoNext && !practice}>
              ↻ Again
            </button>
            <button className="btn btn-secondary" onClick={onMenu}>
              🏠 Home
            </button>
          </div>
        </div>

        <details className="results-details">
          <summary>See details</summary>
          <p className="small muted center">
            {MODE_LABEL[mode]}
            {speed < 1 ? ` · ${Math.round(speed * 100)}% speed` : ''}
            {section ? ` · bars ${section.firstBar}–${section.lastBar} ×${section.repeats}` : ''}
            {guided ? ' · with the helper' : ''} · Score <b>{results.score.toLocaleString()}</b>
            {outcome.ranked && !update.newBestScore && update.previous.bestScore > 0 ? ` · Best ${update.previous.bestScore.toLocaleString()}` : ''}
          </p>
          <div className="stat-grid">
            <div className="stat">
              <span className="stat-value">{pct(results.noteAccuracy)}</span>
              <span className="stat-label">Note accuracy</span>
            </div>
            <div className="stat">
              <span className="stat-value">{pct(results.timingAccuracy)}</span>
              <span className="stat-label">Timing accuracy</span>
            </div>
            <div className="stat">
              <span className="stat-value">{results.maxCombo}</span>
              <span className="stat-label">Max combo</span>
            </div>
          </div>
          <ul className="judgment-list">
            {rows.map(([label, count, cls]) => (
              <li key={label} className={`j-${cls}`}>
                <span>{label}</span>
                <b>{count}</b>
              </li>
            ))}
            <li className="j-wrong">
              <span>Wrong / extra notes</span>
              <b>{results.wrongNotes}</b>
            </li>
            {results.holds.total > 0 && (
              <li className="j-hold">
                <span>Long notes held</span>
                <b>
                  {results.holds.full} / {results.holds.total}
                </b>
              </li>
            )}
            {results.partialChords > 0 && (
              <li className="j-wrong">
                <span>Partial chords</span>
                <b>{results.partialChords}</b>
              </li>
            )}
          </ul>
          {advice && <p className="small muted center">{advice}</p>}
        </details>
      </section>
    </main>
  );
}
