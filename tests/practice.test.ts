import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { LivePalette } from '../src/world/palette';
import { World } from '../src/world/world';
import { PRACTICE_SEED } from '../src/ui/onboarding';

// The practice course places its own pickups and power-ups (one per lesson),
// but is otherwise the very course the fairness tests fly.

function world(scripted: boolean): World {
  const w = new World(new Scene(), new LivePalette());
  w.scripted = scripted;
  w.reset(CONFIG.field.startClearance, true, 0, PRACTICE_SEED);
  return w;
}

describe('the practice course', () => {
  it('is the same course with or without its own pickups', () => {
    // One at a time: the course's randomness is one stream.
    const fly = (scripted: boolean): string[] => {
      const w = world(scripted);
      const seen: string[] = [];
      for (let t = 0; t < 40; t += 1 / 30) {
        w.advance(1 / 30, 36, 0);
        seen.push(JSON.stringify(w.obstacleAhead(0, CONFIG.field.spawnDepth, 100)));
      }
      return seen;
    };
    expect(fly(true)).toEqual(fly(false));
  });

  it('has none of the course pickups or power-ups, only those it places', () => {
    const w = world(true);
    for (let t = 0; t < 40; t += 1 / 30) {
      w.advance(1 / 30, 36, 0);
      expect(w.pickupAhead(-5, CONFIG.field.spawnDepth)).toBe(false);
      expect(w.powerAhead(-5, CONFIG.field.spawnDepth)).toBe(false);
    }
    w.place('pickup', 95);
    w.place(1, 120);
    expect(w.itemAhead('pickup', 0, 200)?.z).toBeCloseTo(-95, 0);
    expect(w.itemAhead(1, 0, 200)?.z).toBeCloseTo(-120, 0);
    expect(w.itemAhead(0, 0, 200)).toBeNull(); // no shield placed
  });

  it('places them on the safe lane, where the ship can fly through and collect them', () => {
    const w = world(true);
    for (let t = 0; t < 5; t += 1 / 30) w.advance(1 / 30, 36, 0);
    w.place(0, 60);
    const at = w.itemAhead(0, 0, 100)!;
    expect(at.x).toBeCloseTo(w.laneOffset(60)!, 3);
    // Fly straight to it along the lane: it's picked up.
    let got = -1;
    for (let t = 0; t < 3 && got < 0; t += 1 / 60) {
      const prev = w.distance;
      const lane = w.laneOffset(0) ?? 0;
      w.advance(1 / 60, 36, Math.max(-30, Math.min(30, lane * 20)));
      got = w.collectPower(prev);
    }
    expect(got).toBe(0);
  });
});
