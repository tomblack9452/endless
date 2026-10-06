import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { speedAt } from '../src/difficulty';
import type { InstancedField } from '../src/field';
import { LivePalette } from '../src/palette';
import { World } from '../src/world';

// The asteroid belt is open space with its own set pieces. These check they
// happen, and that what belongs to the ground (chasms, cacti, tumbleweeds)
// doesn't. That the way through is always clear is the fairness tests' job.

interface Inner {
  obstacleRocks: InstancedField;
  cacti: InstancedField;
  tumbleweeds: InstancedField;
  arches: InstancedField;
  chasmStart: number;
  lane: number;
  shipX: number;
  laneAt(d: number): number | null;
}

function fly(level: number, seed: number, seconds: number) {
  const world = new World(new Scene(), new LivePalette());
  const w = world as unknown as Inner;
  const startScore = (level - 1) * CONFIG.score.levelLength;
  world.reset(CONFIG.field.startClearance, true, startScore, seed);
  let score = startScore;
  const seen = { swaying: new Set<number>(), still: new Set<number>(), cacti: 0, tumbleweeds: 0, arches: 0, chasm: false, minGap: Infinity };
  for (let t = 0; t < seconds; t += 1 / 20) {
    const speed = speedAt(score);
    world.advance(1 / 20, speed, 0);
    score += speed * (1 / 20) * CONFIG.score.pointsPerUnit;
    const f = w.obstacleRocks;
    for (let i = 0; i < f.top; i++) {
      if (!f.active[i]) continue;
      const key = Math.round(f.d[i] * 10) + (Math.round(f.sx[i] * 100) << 20);
      (f.moving[i] === 1 ? seen.swaying : seen.still).add(key);
      // Where it will be on arrival, against the lane there: always room for the ship.
      const lane = w.laneAt(f.d[i]);
      if (lane !== null && f.d[i] > world.distance + 20) {
        const gap = Math.abs(f.arrivalX(i) + w.shipX - lane) - f.hx[i];
        seen.minGap = Math.min(seen.minGap, gap);
      }
    }
    seen.cacti = Math.max(seen.cacti, w.cacti.count);
    seen.tumbleweeds = Math.max(seen.tumbleweeds, w.tumbleweeds.count);
    seen.arches = Math.max(seen.arches, w.arches.count);
    if (w.chasmStart !== Infinity) seen.chasm = true;
  }
  return seen;
}

describe('the asteroid belt', () => {
  it('is open space: no chasms, cacti, tumbleweeds or arches', () => {
    for (const level of [13, 14, 15]) {
      const s = fly(level, 11, 25);
      expect(s.chasm, `level ${level}`).toBe(false);
      expect(s.cacti, `level ${level}`).toBe(0);
      expect(s.tumbleweeds, `level ${level}`).toBe(0);
      expect(s.arches, `level ${level}`).toBe(0);
    }
  });

  it('drifts rocks across the field from the first level', () => {
    const s = fly(13, 5, 25);
    expect(s.swaying.size).toBeGreaterThan(2);
    expect(s.still.size).toBeGreaterThan(10);
  });

  it('gets busier through its three levels', () => {
    // Rocks placed over the same stretch (after the quiet start of the area), summed over seeds.
    const placed = (level: number) => {
      let n = 0;
      for (const seed of [3, 9, 21, 33, 47]) {
        const world = new World(new Scene(), new LivePalette());
        const w = world as unknown as Record<string, (...a: unknown[]) => void>;
        for (const m of ['asteroid', 'swayingAsteroid']) {
          const orig = w[m].bind(world);
          w[m] = (...a: unknown[]) => {
            n++;
            return orig(...a);
          };
        }
        const start = (level - 1) * CONFIG.score.levelLength + 150; // past the quiet start
        world.reset(CONFIG.field.startClearance, true, start, seed);
        let score = start;
        for (let t = 0; t < 9; t += 1 / 20) {
          const speed = speedAt(score);
          world.advance(1 / 20, speed, 0);
          score += speed * (1 / 20) * CONFIG.score.pointsPerUnit;
        }
      }
      return n;
    };
    const [a, b, c] = [placed(13), placed(14), placed(15)];
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(a);
  });

  it('keeps every rock clear of the lane when the ship gets to it', () => {
    for (const [level, seed] of [[13, 1], [14, 2], [15, 3], [15, 4]]) {
      const s = fly(level, seed, 25);
      // The ship's half width is 0.16; the lane keeps a margin of more than that.
      expect(s.minGap, `level ${level} seed ${seed}`).toBeGreaterThan(CONFIG.ship.hitHalfWidth + 0.3);
    }
  });
});
