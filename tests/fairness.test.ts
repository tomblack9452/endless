import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { lateralSpeedAt, speedAt } from '../src/difficulty';
import { LivePalette } from '../src/palette';
import { ROOM_IDS, type RoomId } from '../src/interior';
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

function drive(seed: number, level: number, autopilot = true, room: RoomId | null = null, seconds = SECONDS): { crashed: boolean; at: number; room: string } {
  const world = new World(new Scene(), new LivePalette());
  world.devRoom = room;
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

  let eased = 0; // steering as the ship eases into it

  for (let t = 0; t < seconds; t += DT) {
    const score = (world.distance - runStart) * CONFIG.score.pointsPerUnit;
    const speed = speedAt(score);
    const steer = autopilot ? Math.max(-1, Math.min(1, (laneAt(world.distance + 3) - hooked.shipX) * 1.5)) : 0;
    const prev = world.distance;
    eased += (steer - eased) * (1 - Math.exp(-CONFIG.steering.response * DT));
    world.advance(DT, speed, eased * lateralSpeedAt(speed));
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

// Every ship room on its own (each one back to back), at the hardest level
// of the ship, for a few seeds.
describe('every room', () => {
  for (const room of ROOM_IDS.filter((r) => r !== 'corridor')) {
    it(`${room} is survivable`, () => {
      for (const seed of SEEDS.slice(0, 4)) {
        const r = drive(seed, 9, true, room, 30);
        expect(r.crashed, `seed ${seed} crashed at score ${r.at} in ${r.room}`).toBe(false);
      }
    });
  }
});

// Other routes: canyon splits (the upper or lower branch) and bridges that
// fork must be survivable down the branch the lane doesn't take, too. This
// pilot takes it whenever there is one, looking well ahead (as a player would,
// seeing the fork from afar) so it has time to cross.
interface SplitHooked extends Hooked {
  altNow: number | null;
  altRoutes: number;
  chasmStart: number;
}

function driveAlt(seed: number, level: number): { crashed: boolean; at: number; splits: number; chasms: number } {
  const world = new World(new Scene(), new LivePalette());
  const hooked = world as unknown as SplitHooked;
  const lanes: [number, number][] = [];
  const alts: [number, number][] = [];
  const chasms = new Set<number>();
  const row = hooked.row.bind(world);
  hooked.row = (d: number) => {
    row(d);
    lanes.push([d, hooked.lane]);
    if (hooked.chasmStart !== Infinity) chasms.add(hooked.chasmStart);
    alts.push([d, hooked.altNow ?? hooked.lane]);
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
  let eased = 0; // steering as the ship eases into it
  for (let t = 0; t < SECONDS; t += DT) {
    const score = (world.distance - runStart) * CONFIG.score.pointsPerUnit;
    const speed = speedAt(score);
    // Head for the other route's offset from the lane at the nearest point it differs
    // (an offset, not a spot 50 units on: the lane itself moves in that distance).
    let target = at(lanes, world.distance + 3);
    for (const ahead of [3, 10, 20, 30, 40, 50]) {
      const off = at(alts, world.distance + ahead) - at(lanes, world.distance + ahead);
      if (Math.abs(off) > 0.5) {
        target += off;
        break;
      }
    }
    const steer = Math.max(-1, Math.min(1, (target - hooked.shipX) * 1.5));
    const prev = world.distance;
    eased += (steer - eased) * (1 - Math.exp(-CONFIG.steering.response * DT));
    world.advance(DT, speed, eased * lateralSpeedAt(speed));
    if (world.overPit() || world.hitTest(prev)) return { crashed: true, at: Math.round(score), splits: hooked.altRoutes, chasms: chasms.size };
  }
  return { crashed: false, at: 0, splits: hooked.altRoutes, chasms: chasms.size };
}

describe('other routes', () => {
  for (const level of [4, 5, 6, 13, 15, 22, 24]) {
    it(`the other branch at level ${level} is survivable for every seed`, () => {
      let splits = 0;
      let chasms = 0;
      for (const seed of SEEDS.slice(0, 5)) {
        const r = driveAlt(seed, level);
        expect(r.crashed, `seed ${seed} crashed at score ${r.at} taking the other branch`).toBe(false);
        splits += r.splits;
        chasms += r.chasms;
      }
      // The test only means something if there are routes and chasms to fly.
      expect(splits).toBeGreaterThan(0);
      expect(chasms).toBeGreaterThan(0);
    });
  }
});
