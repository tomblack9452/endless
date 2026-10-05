import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { lateralSpeedAt, speedAt } from '../src/difficulty';
import { LivePalette } from '../src/palette';
import { World } from '../src/world';

// Fairness: every course must be survivable. A simple autopilot follows the
// safe lane the generator records (steering at the normal limit, no boost)
// from the start of each theme across two loops, for a handful of seeds. Any
// crash or fall is a generator bug.

const SEEDS = [1, 7, 42, 99, 314, 1234, 2024, 65535];
const STARTS = [1, 4, 7, 10, 13, 16, 19, 22]; // each theme across the first loops (incl. biomes)
const SECONDS = 40;
const DT = 1 / 60;

interface Hooked {
  row(d: number): void;
  lane: number;
  shipX: number;
}

function drive(seed: number, level: number, autopilot = true): { crashed: boolean; at: number; room: string } {
  const world = new World(new Scene(), new LivePalette());
  const hooked = world as unknown as Hooked;
  // Record the lane at each generated row.
  const lanes: [number, number][] = [];
  const row = hooked.row.bind(world);
  hooked.row = (d: number) => {
    row(d);
    lanes.push([d, hooked.lane]);
    if (lanes.length > 600) lanes.shift();
  };
  const startScore = Math.max(0, (level - 1) * CONFIG.score.levelLength - 60);
  world.reset(CONFIG.field.startClearance, true, startScore, seed);
  const runStart = world.distance - startScore / CONFIG.score.pointsPerUnit;

  const laneAt = (d: number): number => {
    let best = hooked.shipX;
    let gap = Infinity;
    for (const [rd, x] of lanes) {
      const g = Math.abs(rd - d);
      if (g < gap) {
        gap = g;
        best = x;
      }
    }
    return best;
  };

  for (let t = 0; t < SECONDS; t += DT) {
    const score = (world.distance - runStart) * CONFIG.score.pointsPerUnit;
    const speed = speedAt(score);
    const steer = autopilot ? Math.max(-1, Math.min(1, (laneAt(world.distance + 3) - hooked.shipX) * 1.5)) : 0;
    const prev = world.distance;
    world.advance(DT, speed, steer * lateralSpeedAt(speed));
    if (world.overPit() || world.hitTest(prev)) return { crashed: true, at: Math.round(score), room: world.roomName };
  }
  return { crashed: false, at: 0, room: '' };
}

describe('course fairness', () => {
  it('the harness notices crashes (a ship that never steers hits something)', () => {
    const crashes = SEEDS.filter((seed) => drive(seed, 4, false).crashed).length;
    expect(crashes).toBeGreaterThan(0);
  });

  for (const level of STARTS) {
    it(`level ${level} is survivable for every seed`, () => {
      for (const seed of SEEDS) {
        const r = drive(seed, level);
        expect(r.crashed, `seed ${seed} crashed at score ${r.at} ${r.room ? `in ${r.room}` : ''}`).toBe(false);
      }
    });
  }
});

// Canyon splits: the other branch must be survivable too. This pilot takes it
// whenever there is one, looking well ahead (as a player would, seeing the
// island from afar) so it has time to cross.
interface SplitHooked extends Hooked {
  splitStart: number;
  splitEnd: number;
  altLane: number;
}

function driveAlt(seed: number, level: number): { crashed: boolean; at: number; splits: number } {
  const world = new World(new Scene(), new LivePalette());
  const hooked = world as unknown as SplitHooked;
  const lanes: [number, number][] = [];
  const alts: [number, number][] = [];
  const starts = new Set<number>();
  const row = hooked.row.bind(world);
  hooked.row = (d: number) => {
    row(d);
    lanes.push([d, hooked.lane]);
    const inSplit = d >= hooked.splitStart && d <= hooked.splitEnd;
    if (inSplit) starts.add(hooked.splitStart);
    alts.push([d, inSplit ? hooked.altLane : hooked.lane]);
    if (lanes.length > 800) {
      lanes.shift();
      alts.shift();
    }
  };
  const startScore = (level - 1) * CONFIG.score.levelLength;
  world.reset(CONFIG.field.startClearance, true, startScore, seed);
  const runStart = world.distance - startScore / CONFIG.score.pointsPerUnit;
  const at = (arr: [number, number][], d: number): number => {
    let best = hooked.shipX;
    let gap = Infinity;
    for (const [rd, x] of arr) {
      const g = Math.abs(rd - d);
      if (g < gap) {
        gap = g;
        best = x;
      }
    }
    return best;
  };
  for (let t = 0; t < SECONDS; t += DT) {
    const score = (world.distance - runStart) * CONFIG.score.pointsPerUnit;
    const speed = speedAt(score);
    let target = at(lanes, world.distance + 3);
    for (const ahead of [3, 10, 20, 30, 40, 50]) {
      const a = at(alts, world.distance + ahead);
      if (Math.abs(a - at(lanes, world.distance + ahead)) > 0.5) {
        target = a;
        break;
      }
    }
    const steer = Math.max(-1, Math.min(1, (target - hooked.shipX) * 1.5));
    const prev = world.distance;
    world.advance(DT, speed, steer * lateralSpeedAt(speed));
    if (world.overPit() || world.hitTest(prev)) return { crashed: true, at: Math.round(score), splits: starts.size };
  }
  return { crashed: false, at: 0, splits: starts.size };
}

describe('canyon splits', () => {
  for (const level of [4, 13, 22]) {
    it(`the other branch at level ${level} is survivable for every seed`, () => {
      let splits = 0;
      for (const seed of SEEDS.slice(0, 5)) {
        const r = driveAlt(seed, level);
        expect(r.crashed, `seed ${seed} crashed at score ${r.at} taking the other branch`).toBe(false);
        splits += r.splits;
      }
      expect(splits).toBeGreaterThan(0); // the test only means something if splits happen
    });
  }
});
