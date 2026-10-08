import { describe, expect, it } from 'vitest';
import { ShowroomSpin } from '../src/showroom';

// The showroom camera's turn (src/showroom.ts): dragging turns it, the
// automatic spin waits while the ship is held and after, then eases back in
// without a jump.

const step = (s: ShowroomSpin, seconds: number, dt = 1 / 60): number => {
  let a = 0;
  for (let t = 0; t < seconds - 1e-9; t += dt) a = s.update(dt);
  return a;
};

describe('ShowroomSpin', () => {
  it('spins on its own when nobody touches it', () => {
    const s = new ShowroomSpin({ spin: 0.5 });
    expect(step(s, 2)).toBeCloseTo(1, 5);
  });

  it('turns with a drag, the other way to the finger', () => {
    const s = new ShowroomSpin({ spin: 0.5, perPx: 0.01 });
    const before = s.update(1 / 60);
    s.drag(100);
    expect(s.update(1 / 60)).toBeCloseTo(before - 1, 5);
    s.drag(-50);
    expect(s.update(1 / 60)).toBeCloseTo(before - 0.5, 5);
  });

  it('holds still while held, and carries a flick on after letting go', () => {
    const s = new ShowroomSpin({ spin: 0.5, perPx: 0.01 });
    s.drag(10);
    const held = s.update(1 / 60);
    expect(s.held).toBe(true);
    // Still held, finger still: nothing moves.
    expect(step(s, 1)).toBeCloseTo(held, 2);

    const f = new ShowroomSpin({ spin: 0.5, perPx: 0.01 });
    for (let i = 0; i < 10; i++) {
      f.drag(-5); // a quick swipe left
      f.update(1 / 60);
    }
    f.release();
    const letGo = f.update(1 / 60);
    const later = step(f, 1);
    expect(later).toBeGreaterThan(letGo); // the flick carried on the same way
  });

  it('pauses the spin during a drag and for the wait after', () => {
    const s = new ShowroomSpin({ spin: 0.5, resumeAfter: 3 });
    s.drag(0);
    const a = s.update(1 / 60);
    expect(s.autoShare).toBe(0);
    expect(step(s, 2)).toBeCloseTo(a, 6); // held: no spin
    s.release();
    expect(step(s, 2.9)).toBeCloseTo(a, 6); // let go, no flick: still no spin before the wait is up
    expect(s.autoShare).toBe(0);
  });

  it('eases back into the spin after the wait, from where it was left', () => {
    const dt = 1 / 60;
    const s = new ShowroomSpin({ spin: 0.5, perPx: 0.01, resumeAfter: 3, easeIn: 1 });
    s.drag(150);
    s.update(dt);
    const left = step(s, 0.5); // held still a moment, so no flick
    s.release();
    expect(s.update(dt)).toBeCloseTo(left, 3);
    let last = s.update(dt);
    let biggest = 0;
    for (let t = 0; t < 8; t += dt) {
      const a = s.update(dt);
      biggest = Math.max(biggest, Math.abs(a - last));
      last = a;
    }
    // The spin comes back smoothly: never a step bigger than a full-speed frame's.
    expect(biggest).toBeLessThanOrEqual(0.5 * dt + 1e-9);
    expect(s.autoShare).toBe(1);
    // Back at full speed.
    const a = s.update(dt);
    expect(s.update(dt) - a).toBeCloseTo(0.5 * dt, 6);
  });
});
