import { isBlackKey, midiToNoteName, midiToPitchClass } from './noteNames';

export type KeyFeedback =
  | { readonly kind: 'correct' }
  | { readonly kind: 'wrong-octave'; readonly octaves: number; readonly direction: 'higher' | 'lower'; readonly message: string }
  | { readonly kind: 'wrong-key'; readonly whiteKeys: number; readonly direction: 'left' | 'right'; readonly message: string };

/** White keys you pass moving from `from` to `to`, counting the target and not the starting key. */
function whiteKeySteps(from: number, to: number): number {
  let n = 0;
  if (to > from) {
    for (let m = from + 1; m <= to; m++) if (!isBlackKey(m)) n++;
  } else {
    for (let m = to; m < from; m++) if (!isBlackKey(m)) n++;
  }
  return n;
}

/**
 * Friendly guidance for the "find your keys" step: tell a beginner how to get
 * from the key they pressed to the one we asked for, in the terms they can see
 * on a keyboard (white keys left/right, octaves up/down).
 */
export function keyFeedback(target: number, played: number): KeyFeedback {
  if (played === target) return { kind: 'correct' };
  const name = midiToPitchClass(target);
  if (midiToPitchClass(played) === name) {
    const octaves = Math.round(Math.abs(played - target) / 12);
    const direction = played > target ? 'higher' : 'lower';
    return {
      kind: 'wrong-octave',
      octaves,
      direction,
      message: `That's a ${name}, but ${octaves === 1 ? 'one octave' : `${octaves} octaves`} too ${direction === 'higher' ? 'high' : 'low'}. Move ${direction === 'higher' ? 'left (down)' : 'right (up)'} to the ${name} ${target === 60 ? 'nearest the middle of the keyboard' : `next to middle C`}.`,
    };
  }
  const direction = target < played ? 'left' : 'right';
  const steps = whiteKeySteps(played, target);
  const playedName = midiToNoteName(played);
  const where = isBlackKey(played) ? ' (a black key)' : '';
  return {
    kind: 'wrong-key',
    whiteKeys: steps,
    direction,
    message:
      Math.abs(played - target) > 12
        ? `That was ${playedName}${where} — quite far away. ${midiToNoteName(target)} is ${direction === 'left' ? 'to the left' : 'to the right'}, near the middle of the keyboard.`
        : `That was ${playedName}${where}. ${midiToNoteName(target)} is ${steps === 1 ? 'the next white key' : `${steps} white keys`} to the ${direction}.`,
  };
}
