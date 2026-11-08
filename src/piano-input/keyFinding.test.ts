import { describe, expect, it } from 'vitest';
import { keyFeedback } from './keyFinding';

describe('keyFeedback (find your keys)', () => {
  it('accepts the right key', () => {
    expect(keyFeedback(60, 60)).toEqual({ kind: 'correct' });
  });

  it('spots the right note in the wrong octave', () => {
    const f = keyFeedback(60, 72);
    expect(f).toMatchObject({ kind: 'wrong-octave', octaves: 1, direction: 'higher' });
    expect(f.kind !== 'correct' && f.message).toMatch(/one octave too high/);
    expect(keyFeedback(60, 36)).toMatchObject({ kind: 'wrong-octave', octaves: 2, direction: 'lower' });
  });

  it('counts white keys to the target', () => {
    expect(keyFeedback(60, 64)).toMatchObject({ kind: 'wrong-key', whiteKeys: 2, direction: 'left' }); // E4 → C4
    expect(keyFeedback(67, 65)).toMatchObject({ kind: 'wrong-key', whiteKeys: 1, direction: 'right' }); // F4 → G4
    expect(keyFeedback(64, 60)).toMatchObject({ kind: 'wrong-key', whiteKeys: 2, direction: 'right' });
  });

  it('mentions black keys and handles far-away presses', () => {
    const black = keyFeedback(60, 61);
    expect(black.kind !== 'correct' && black.message).toMatch(/C#4 \(a black key\)/);
    expect(black).toMatchObject({ whiteKeys: 1, direction: 'left' });
    const far = keyFeedback(60, 84 + 2);
    expect(far.kind !== 'correct' && far.message).toMatch(/quite far away/);
  });
});
