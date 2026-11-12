import type { LevelDefinition } from '../../song-content/level';
import type { ProgressMap } from '../../game-engine/progression';
import { Stars } from './Stars';

interface LevelMapProps {
  levels: readonly LevelDefinition[];
  progress: ProgressMap;
  isOpen: (level: LevelDefinition) => boolean;
  /** The level to play next (gets the "you are here" marker). */
  current: LevelDefinition | null;
  onPick: (level: LevelDefinition) => void;
}

const COLS = 5;
const COL_W = 100;
const ROW_H = 125;

/**
 * A world's levels as a winding path of big round stops, like a board game:
 * left to right, then back right to left on the next row.
 */
export function LevelMap({ levels, progress, isOpen, current, onPick }: LevelMapProps) {
  const rows = Math.ceil(levels.length / COLS);
  const width = COLS * COL_W;
  const height = rows * ROW_H;
  const points = levels.map((_, i) => {
    const row = Math.floor(i / COLS);
    const col = row % 2 === 0 ? i % COLS : COLS - 1 - (i % COLS);
    // A gentle up-and-down wave so the path doesn't look like a table.
    return { x: COL_W / 2 + col * COL_W, y: ROW_H * 0.42 + row * ROW_H + (col % 2 ? 8 : -8) };
  });

  const doneUpTo = levels.reduce((n, l, i) => (progress[l.id]?.completed ? i + 1 : n), 0);
  const track = pathThrough(points, width);
  // Coloured up to the next stop to play.
  const travelled = doneUpTo > 0 ? pathThrough(points.slice(0, doneUpTo + 1), width) : '';

  return (
    <div className="level-map" style={{ aspectRatio: `${width} / ${height}`, maxWidth: `max(560px, calc((100dvh - 250px) * ${width / height}))` }}>
      <svg className="level-map-path" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
        <path d={track} className="path-track" />
        {travelled && <path d={travelled} className="path-done" />}
      </svg>
      <ol className="level-map-stops">
        {levels.map((level, i) => {
          const p = points[i]!;
          const open = isOpen(level);
          const lp = progress[level.id];
          const done = !!lp?.completed;
          const here = level === current;
          return (
            <li key={level.id} style={{ left: `${(p.x / width) * 100}%`, top: `${(p.y / height) * 100}%` }}>
              <button
                className={`stop${done ? ' done' : ''}${open ? '' : ' locked'}${here ? ' here' : ''}`}
                onClick={() => onPick(level)}
                aria-label={`Level ${level.number}: ${level.title}${open ? `, ${lp?.bestStars ?? 0} stars` : ', locked'}`}
              >
                {here && (
                  <span className="stop-flag" aria-hidden>
                    ▶ Play
                  </span>
                )}
                <span className="stop-num" aria-hidden>
                  {open ? level.number : '🔒'}
                </span>
                {lp?.challengeCleared && (
                  <span className="stop-trophy" aria-hidden>
                    🏆
                  </span>
                )}
                <span className="stop-label" aria-hidden>
                  <span className="stop-title">{level.title}</span>
                  {open && <Stars count={lp?.bestStars ?? 0} small />}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** A smooth path through the stops; row ends turn with an outward bulge. */
function pathThrough(points: readonly { x: number; y: number }[], width: number): string {
  return points
    .map((p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`;
      const prev = points[i - 1]!;
      if (Math.abs(prev.y - p.y) > ROW_H / 2) {
        const out = p.x > width / 2 ? 48 : -48;
        return `C ${prev.x + out} ${prev.y}, ${p.x + out} ${p.y}, ${p.x} ${p.y}`;
      }
      const mid = (prev.x + p.x) / 2;
      return `C ${mid} ${prev.y}, ${mid} ${p.y}, ${p.x} ${p.y}`;
    })
    .join(' ');
}
