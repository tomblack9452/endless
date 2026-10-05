import { beforeAll, describe, expect, it } from 'vitest';
import type { Input as InputType } from '../src/input';

// Double-tap and hold to boost, driven with fake pointer events (no browser needed).

interface Press {
  pointerId: number;
  clientX: number;
  clientY: number;
  timeStamp: number;
}

type Handlers = {
  onDown(e: Press): void;
  onMove(e: Press): void;
  onUp(e: Press): void;
};

let Input: typeof InputType;

beforeAll(async () => {
  const g = globalThis as Record<string, unknown>;
  g.window ??= Object.assign(new EventTarget(), { innerWidth: 375, innerHeight: 812 });
  g.DeviceOrientationEvent ??= class {};
  ({ Input } = await import('../src/input'));
});

function make(): { input: InputType; h: Handlers } {
  const input = new Input(new EventTarget() as HTMLElement);
  input.enabled = true;
  return { input, h: input as unknown as Handlers };
}

const at = (id: number, t: number, x = 180, y = 400): Press => ({ pointerId: id, clientX: x, clientY: y, timeStamp: t });

describe('double-tap and hold to boost', () => {
  it('boosts while the second press of a quick double-tap is held', () => {
    const { input, h } = make();
    h.onDown(at(1, 0));
    h.onUp(at(1, 90));
    expect(input.boostHeld()).toBe(false);
    h.onDown(at(2, 250));
    expect(input.boostHeld()).toBe(true);
    h.onUp(at(2, 900));
    expect(input.boostHeld()).toBe(false);
  });

  it('a single press never boosts', () => {
    const { input, h } = make();
    h.onDown(at(1, 0));
    expect(input.boostHeld()).toBe(false);
  });

  it('a slow second tap, a long first press or a drag does not boost', () => {
    const slow = make();
    slow.h.onDown(at(1, 0));
    slow.h.onUp(at(1, 90));
    slow.h.onDown(at(2, 500));
    expect(slow.input.boostHeld()).toBe(false);

    const long = make();
    long.h.onDown(at(1, 0));
    long.h.onUp(at(1, 400));
    long.h.onDown(at(2, 450));
    expect(long.input.boostHeld()).toBe(false);

    const drag = make();
    drag.h.onDown(at(1, 0));
    drag.h.onMove(at(1, 50, 240));
    drag.h.onUp(at(1, 90, 240));
    drag.h.onDown(at(2, 150, 240));
    expect(drag.input.boostHeld()).toBe(false);
  });

  it('taps on opposite sides (tap-sides steering) do not boost', () => {
    const { input, h } = make();
    input.sidesMode = true;
    h.onDown(at(1, 0, 40));
    h.onUp(at(1, 90, 40));
    h.onDown(at(2, 200, 330));
    expect(input.boostHeld()).toBe(false);
  });

  it('still steers while boosting, and can be turned off', () => {
    const { input, h } = make();
    h.onDown(at(1, 0));
    h.onUp(at(1, 90));
    h.onDown(at(2, 200));
    h.onMove(at(2, 300, 230));
    expect(input.steering()).toBeGreaterThan(0);

    const off = make();
    off.input.doubleTapBoost = false;
    off.h.onDown(at(1, 0));
    off.h.onUp(at(1, 90));
    off.h.onDown(at(2, 200));
    expect(off.input.boostHeld()).toBe(false);
  });
});
