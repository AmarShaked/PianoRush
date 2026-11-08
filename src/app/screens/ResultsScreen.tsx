import type { GameResults } from '../../game-engine/GameEngine';

interface ResultsScreenProps {
  title: string;
  results: GameResults;
  previousBest: number;
  onRetry: () => void;
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

export function ResultsScreen({ title, results, previousBest, onRetry, onMenu }: ResultsScreenProps) {
  const newBest = results.score > previousBest;
  const advice = offsetAdvice(results.meanOffsetMs);
  const rows: Array<[string, number, string]> = [
    ['Perfect', results.counts.perfect, 'perfect'],
    ['Great', results.counts.great, 'great'],
    ['Good', results.counts.good, 'good'],
    ['Miss', results.counts.miss, 'miss'],
  ];

  return (
    <main className="screen results-screen">
      <section className="card results-card" aria-labelledby="results-title">
        <div className="eyebrow">Level complete</div>
        <h2 id="results-title">{title}</h2>

        <div className="stars" aria-label={`${results.stars} of 3 stars`}>
          {[1, 2, 3].map((i) => (
            <span key={i} className={i <= results.stars ? 'star on' : 'star'} style={{ animationDelay: `${i * 150}ms` }}>
              ★
            </span>
          ))}
        </div>

        <div className="big-score">
          {results.score.toLocaleString()}
          {newBest && <span className="badge">New best!</span>}
        </div>
        {!newBest && previousBest > 0 && <p className="muted small center">Personal best: {previousBest.toLocaleString()}</p>}

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
        </ul>

        {advice && <p className="small muted center">{advice}</p>}

        <div className="overlay-actions">
          <button className="btn btn-primary" onClick={onRetry} autoFocus>
            ↻ Play again
          </button>
          <button className="btn btn-ghost" onClick={onMenu}>
            Main menu
          </button>
        </div>
      </section>
    </main>
  );
}
