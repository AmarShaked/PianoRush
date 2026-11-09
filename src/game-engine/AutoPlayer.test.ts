import { describe, expect, it } from 'vitest';
import { AutoPlayer } from './AutoPlayer';
import { GameEngine } from './GameEngine';
import { compileSong, HITS, WORLD_1, WORLD_2, WORLD_3, WORLD_4, WORLD_5, WORLD_6 } from '../song-content';

const LEVELS = [WORLD_1, WORLD_2, WORLD_3, WORLD_4, WORLD_5, WORLD_6, HITS].flatMap((w) => w.levels);

/** Drive an engine frame by frame (uneven frame times) with the auto-player feeding it. */
function listen(song: ReturnType<typeof compileSong>, onFrame?: (engine: GameEngine, now: number) => void) {
  const engine = new GameEngine(song, { inputOffsetMs: 0 });
  const auto = new AutoPlayer(song);
  let now = 1000;
  engine.start(now);
  let frame = 0;
  while (engine.currentState !== 'finished' && frame < 200_000) {
    now += 12 + (frame++ % 3) * 5; // 12 / 17 / 22 ms frames
    onFrame?.(engine, now);
    auto.update(engine, now);
    engine.update(now);
  }
  return engine.getResults();
}

describe('AutoPlayer (Listen mode)', () => {
  it.each(LEVELS.map((l) => [l.id, l] as const))('plays %s perfectly', (_id, level) => {
    const r = listen(compileSong(level.song));
    expect(r.counts.perfect).toBe(r.totalEvents);
    expect(r.counts.miss).toBe(0);
    expect(r.wrongNotes).toBe(0);
    expect(r.holds.full).toBe(r.holds.total);
    expect(r.partialChords).toBe(0);
  });

  it('carries on after a pause and replays from the start after a restart', () => {
    const song = compileSong(HITS.levels[0]!.song);
    let paused = false;
    let restarted = false;
    const r = listen(song, (engine, now) => {
      const t = engine.songTimeAt(now);
      if (!paused && t > 5000) {
        paused = true;
        engine.pause(now);
        engine.resume(now + 2000);
      } else if (paused && !restarted && t > 9000) {
        restarted = true;
        engine.restart();
        engine.start(now);
      }
    });
    expect(restarted).toBe(true);
    expect(r.counts.perfect).toBe(r.totalEvents);
    expect(r.wrongNotes).toBe(0);
  });
});
