import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { speedAt } from '../src/difficulty';
import type { InstancedField } from '../src/field';
import { LivePalette } from '../src/palette';
import { World } from '../src/world';

// The volcanic plain: lava rivers crossed on a causeway that follows the lane,
// geysers on a cycle of distance, bombs in salvos, basalt columns. That the
// lane is always flyable is the fairness tests' job; these check the features
// happen and do what they say.

interface Inner {
  rivers: { d0: number; d1: number; half: number }[];
  lane: number;
  shipX: number;
  distance: number;
  vents: InstancedField;
  lavaBombs: InstancedField;
  columns: InstancedField;
  laneAt(d: number): number | null;
  runStart: number;
}

function start(level: number, seed: number) {
  const world = new World(new Scene(), new LivePalette());
  const startScore = (level - 1) * CONFIG.score.levelLength + 150; // past the quiet start
  world.reset(CONFIG.field.startClearance, true, startScore, seed);
  return { world, w: world as unknown as Inner, score: startScore };
}

function run(level: number, seed: number, seconds: number, each: (w: Inner, world: World) => void = () => {}) {
  const s = start(level, seed);
  let score = s.score;
  const seen = { rivers: new Set<number>(), bombs: new Set<number>(), vents: new Set<number>(), columns: new Set<number>() };
  for (let t = 0; t < seconds; t += 1 / 20) {
    const speed = speedAt(score);
    s.world.advance(1 / 20, speed, 0);
    score += speed * (1 / 20) * CONFIG.score.pointsPerUnit;
    for (const r of s.w.rivers) seen.rivers.add(Math.round(r.d0));
    for (const [f, set] of [[s.w.lavaBombs, seen.bombs], [s.w.vents, seen.vents], [s.w.columns, seen.columns]] as const) {
      for (let i = 0; i < f.top; i++) if (f.active[i]) set.add(Math.round(f.d[i] * 10));
    }
    each(s.w, s.world);
  }
  return seen;
}

describe('the volcanic plain', () => {
  it('has lava rivers, geysers, bombs and basalt columns', () => {
    const s = run(20, 4, 25);
    expect(s.rivers.size).toBeGreaterThan(0);
    expect(s.vents.size).toBeGreaterThan(0);
    expect(s.bombs.size).toBeGreaterThan(2);
    expect(s.columns.size).toBeGreaterThan(5);
  });

  it('is lava off the causeway and safe on it', () => {
    for (const level of [19, 20, 21]) {
      const { world, w } = start(level, 8);
      for (let i = 0; i < 600 && w.rivers.length === 0; i++) world.advance(1 / 20, 50, 0);
      expect(w.rivers.length, `level ${level}`).toBeGreaterThan(0);
      const r = w.rivers[0];
      const mid = (r.d0 + r.d1) / 2;
      const lane = w.laneAt(mid);
      expect(lane).not.toBeNull();
      w.distance = mid; // put the ship in the middle of the river
      w.shipX = lane!;
      expect(world.inLava(), 'on the lane').toBe(false);
      w.shipX = lane! + r.half - 0.2;
      expect(world.inLava(), 'at the edge of the causeway').toBe(false);
      w.shipX = lane! + r.half + 0.5;
      expect(world.inLava(), 'just off it').toBe(true);
      w.shipX = lane! - r.half - 3;
      expect(world.inLava(), 'the other side').toBe(true);
      w.distance = r.d1 + 5; // past the river
      w.shipX = lane! + 10;
      expect(world.inLava(), 'once across').toBe(false);
    }
  });

  it('narrows the causeway deeper in', () => {
    const half = [19, 20, 21].map((level) => {
      const { world, w } = start(level, 3);
      for (let i = 0; i < 800 && w.rivers.length === 0; i++) world.advance(1 / 20, 50, 0);
      return w.rivers[0]?.half ?? NaN;
    });
    expect(half[0]).toBeGreaterThan(half[1]);
    expect(half[1]).toBeGreaterThan(half[2]);
    // Always wider than the lane's own clear width, so the lane is never on the edge.
    expect(half[2]).toBeGreaterThan(CONFIG.themes.lane.halfWidth + 0.3);
  });

  it('has a geyser on the lane that is down as you get to it', () => {
    let onLane = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      run(21, seed, 20, (w) => {
        const f = w.vents;
        for (let i = 0; i < f.top; i++) {
          if (!f.active[i] || f.moving[i] !== 4) continue;
          const lane = w.laneAt(f.d[i]);
          if (lane === null || f.d[i] < w.distance + 30) continue;
          if (Math.abs(f.x[i] + w.shipX - lane) > CONFIG.themes.lane.halfWidth + f.hx[i]) continue;
          onLane++;
          // sin(freq * (distance - d) + phase) at distance = d is sin(phase): in the sunk part of the cycle.
          expect(Math.sin(f.phase[i])).toBeLessThan(-0.9);
        }
      });
    }
    expect(onLane).toBeGreaterThan(0);
  });

  it('throws bombs in bigger salvos deeper in', () => {
    const biggest = (level: number): number => {
      let most = 0;
      for (const seed of [1, 2, 3, 4]) {
        const ds: number[] = [];
        run(level, seed, 14, (w) => {
          const f = w.lavaBombs;
          // Only this level's own: the world builds 230 units ahead, into the next.
          const end = w.runStart + (level * CONFIG.score.levelLength) / CONFIG.score.pointsPerUnit;
          for (let i = 0; i < f.top; i++) if (f.active[i] && f.d[i] < end && !ds.includes(f.d[i])) ds.push(f.d[i]);
        });
        ds.sort((a, b) => a - b);
        let group = 1;
        for (let i = 1; i < ds.length; i++) {
          group = ds[i] - ds[i - 1] < 15 ? group + 1 : 1;
          most = Math.max(most, group);
        }
      }
      return most;
    };
    expect(biggest(19)).toBe(0); // none at level 1 of the plain
    expect(biggest(20)).toBeGreaterThanOrEqual(2);
    expect(biggest(21)).toBeGreaterThanOrEqual(3);
  });

  it('keeps props off the lava', () => {
    run(21, 6, 30, (w, world) => {
      void world;
      for (const r of w.rivers) {
        for (const f of [w.columns]) {
          for (let i = 0; i < f.top; i++) if (f.active[i] && f.d[i] > r.d0 && f.d[i] < r.d1) throw new Error(`a column stands in the river at ${f.d[i]}`);
        }
      }
    });
  });
});
