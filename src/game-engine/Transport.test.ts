import { describe, expect, it } from 'vitest';
import { Transport } from './Transport';

describe('Transport', () => {
  it('maps clock to song time with count-in and pauses', () => {
    const t = new Transport(1000);
    t.start(0);
    expect(t.songTime(0)).toBe(-1000);
    expect(t.songTime(1500)).toBe(500);
    t.pause(2000);
    expect(t.songTime(9000)).toBe(1000);
    t.resume(5000, 500);
    expect(t.songTime(5400)).toBe(1000); // frozen during the resume countdown
    expect(t.songTime(6000)).toBe(1500);
    expect(t.songTime(1500)).toBe(500); // history is preserved
  });

  it('distinguishes user pauses (no input) from waits (input accepted)', () => {
    const t = new Transport(0);
    t.start(0);
    t.pause(100, 'wait');
    expect(t.isWaitingAt(150)).toBe(true);
    expect(t.acceptsInputAt(150)).toBe(true);
    t.pause(200, 'user'); // player pauses during the wait
    expect(t.isUserPausedAt(250)).toBe(true);
    expect(t.acceptsInputAt(250)).toBe(false);
    expect(t.acceptsInputAt(150)).toBe(true); // earlier input was during the wait
    expect(t.songTime(250)).toBe(100);
    t.resume(300);
    expect(t.songTime(400)).toBe(200);
  });

  it('a wait never starts inside the previous interval', () => {
    const t = new Transport(0);
    t.start(0);
    t.pause(100, 'user');
    t.resume(200);
    t.pause(199.9999999, 'wait'); // rounding: computed slightly before the resume
    expect(t.isWaitingAt(200)).toBe(true);
    expect(t.songTime(500)).toBe(100);
  });
});
