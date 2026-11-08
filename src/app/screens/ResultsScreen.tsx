import type { GameResults } from '../../game-engine/GameEngine';
import type { ProgressUpdate, RunOutcome } from '../../game-engine/progression';
import type { GameMode, LevelDefinition } from '../../song-content/level';
import { Stars } from '../components/Stars';
import { MODE_LABEL } from './GameScreen';

interface ResultsScreenProps {
  level: LevelDefinition;
  mode: GameMode;
  results: GameResults;
  outcome: RunOutcome;
  update: ProgressUpdate;
  nextLevel: LevelDefinition | null;
  onRetry: () => void;
  onPlayMode: (mode: GameMode) => void;
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

export function ResultsScreen(props: ResultsScreenProps) {
  const { level, mode, results, outcome, update, nextLevel, onRetry, onPlayMode, onNext, onMenu } = props;
  const discover = mode === 'discover';
  const advice = discover ? null : offsetAdvice(results.meanOffsetMs);
  const newChallenge = mode === 'challenge' && outcome.completed && !update.previous.challengeCleared;
  const canGoNext = nextLevel !== null && update.current.completed;

  const heading = discover ? 'Practice complete' : outcome.completed ? 'Level complete' : 'Keep practising';
  const rows: Array<[string, number, string]> = [
    ['Perfect', results.counts.perfect, 'perfect'],
    ['Great', results.counts.great, 'great'],
    ['Good', results.counts.good, 'good'],
    ['Miss', results.counts.miss, 'miss'],
  ];

  return (
    <main className="screen results-screen">
      <section className="card results-card" aria-labelledby="results-title">
        <div className="eyebrow">
          {heading} · {MODE_LABEL[mode]}
        </div>
        <h2 id="results-title">
          {level.number}. {level.title}
        </h2>

        {!discover && <Stars count={outcome.stars} animate />}

        <div className="big-score">
          {results.score.toLocaleString()}
          {update.newBestScore && <span className="badge">New best!</span>}
        </div>
        {!discover && !update.newBestScore && update.previous.bestScore > 0 && (
          <p className="muted small center">Personal best: {update.previous.bestScore.toLocaleString()}</p>
        )}

        {(update.unlockedNext || newChallenge || !outcome.completed) && (
          <div className="result-messages">
            {update.unlockedNext && nextLevel && (
              <p className="msg ok">
                🔓 Level {nextLevel.number} “{nextLevel.title}” unlocked!
              </p>
            )}
            {newChallenge && <p className="msg ok">🏆 Challenge cleared!</p>}
            {discover && <p className="msg">Nice work learning the notes. Try Flow mode to earn stars.</p>}
            {!discover && !outcome.completed && (
              <p className="msg warn">
                Hit at least {Math.round(level.completion.minNoteAccuracy * 100)}% of the notes to complete the level. Discover mode
                lets you learn them at your own pace.
              </p>
            )}
          </div>
        )}

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

        <div className="overlay-actions">
          {canGoNext && (
            <button className="btn btn-primary" onClick={onNext} autoFocus>
              Next level: {nextLevel.title} →
            </button>
          )}
          {discover && (
            <button className="btn btn-primary" onClick={() => onPlayMode('flow')} autoFocus={!canGoNext}>
              ▶ Play in Flow mode
            </button>
          )}
          <button className={`btn ${canGoNext || discover ? 'btn-secondary' : 'btn-primary'}`} onClick={onRetry} autoFocus={!canGoNext && !discover}>
            ↻ Play again
          </button>
          <button className="btn btn-ghost" onClick={onMenu}>
            Level select
          </button>
        </div>
      </section>
    </main>
  );
}
