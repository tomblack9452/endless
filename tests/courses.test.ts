import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { type Course, COURSES, courseLength, ENVIRONMENTS, weeklyRun } from '../src/courses';
import { lateralSpeedAt, speedAt } from '../src/difficulty';
import { LivePalette } from '../src/palette';
import { World } from '../src/world';

// Every set level must be finishable: the autopilot follows the safe lane at
// each section's speed from the start line to the finish.

interface Hooked {
  row(d: number): void;
  lane: number;
  shipX: number;
}

function fly(course: Course): { finished: boolean; at: number; section: string; room: string } {
  const world = new World(new Scene(), new LivePalette());
  const hooked = world as unknown as Hooked;
  const lanes: [number, number][] = [];
  const row = hooked.row.bind(world);
  hooked.row = (d: number) => {
    row(d);
    lanes.push([d, hooked.lane]);
    if (lanes.length > 800) lanes.shift();
  };
  world.setCourse(course);
  world.reset(CONFIG.field.startClearance, true, 0, course.seed);
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
  const DT = 1 / 60;
  const start = world.distance;
  let eased = 0; // steering as the ship eases into it
  for (let t = 0; t < 600 && world.distance < world.finishAt; t += DT) {
    const section = world.sectionAt(world.distance)!;
    const speed = speedAt(section.difficulty);
    const steer = Math.max(-1, Math.min(1, (laneAt(world.distance + 3) - hooked.shipX) * 1.5));
    const prev = world.distance;
    eased += (steer - eased) * (1 - Math.exp(-CONFIG.steering.response * (world.onIce() ? CONFIG.hazards.ice.grip : 1) * DT));
    world.advance(DT, speed, eased * lateralSpeedAt(speed));
    if (world.overPit() || world.inLava() || world.hitTest(prev)) {
      return { finished: false, at: Math.round(world.distance - start), section: section.name, room: world.roomName };
    }
  }
  return { finished: world.distance >= world.finishAt, at: Math.round(world.distance - start), section: '', room: '' };
}

describe('set levels', () => {
  COURSES.forEach((c, i) => {
    it(`level ${i + 1} (${c.name}) can be flown to the finish`, () => {
      const r = fly(c);
      expect(r.finished, `crashed ${r.at} of ${courseLength(c)} units in, in ${r.section}${r.room ? ` (${r.room})` : ''}`).toBe(true);
    });
  });

  it('runs 2 to 4 minutes each at section speed', () => {
    for (const c of COURSES) {
      const seconds = c.sections.reduce((t, s) => t + s.length / speedAt(s.difficulty), 0);
      expect(seconds, c.name).toBeGreaterThan(100);
      expect(seconds, c.name).toBeLessThan(260);
    }
  });
});

// Solo: each environment, endless in it, from the start for 40 seconds.
describe('solo environments', () => {
  ENVIRONMENTS.forEach((env) => {
    it(`${env.name} is survivable`, () => {
      for (const seed of [3, 17, 99]) {
        const world = new World(new Scene(), new LivePalette());
        const hooked = world as unknown as Hooked;
        const lanes: [number, number][] = [];
        const row = hooked.row.bind(world);
        hooked.row = (d: number) => {
          row(d);
          lanes.push([d, hooked.lane]);
          if (lanes.length > 800) lanes.shift();
        };
        world.setEnvironment(env);
        world.reset(CONFIG.field.startClearance, true, 0, seed);
        const start = world.distance;
        let crashed = false;
        let eased = 0; // steering as the ship eases into it
        for (let t = 0; t < 40 && !crashed; t += 1 / 60) {
          const score = (world.distance - start) * CONFIG.score.pointsPerUnit;
          const speed = speedAt(score);
          let target = hooked.shipX;
          let gap = Infinity;
          for (const [rd, x] of lanes) {
            const g = Math.abs(rd - (world.distance + 3));
            if (g < gap) {
              gap = g;
              target = x;
            }
          }
          const prev = world.distance;
          eased += (Math.max(-1, Math.min(1, (target - hooked.shipX) * 1.5)) - eased) * (1 - Math.exp(-(CONFIG.steering.response * (world.onIce() ? CONFIG.hazards.ice.grip : 1)) / 60));
          world.advance(1 / 60, speed, eased * lateralSpeedAt(speed));
          crashed = world.overPit() || world.inLava() || world.hitTest(prev);
        }
        expect(crashed, `${env.name}, seed ${seed}`).toBe(false);
      }
    });
  });
});


// Ranked: endless from the start on the week's seed. Twelve weeks in a row,
// each survivable for 90 seconds by a pilot that follows the lane.
function mondays(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(new Date(Date.UTC(2026, 9, 5 + 7 * i)).toISOString().slice(0, 10));
  return out;
}

/** Fly an endless run on `seed`; returns the lane seen at each row, and whether it crashed. */
function flyEndless(seed: number, seconds: number, opts: { weave?: boolean; boost?: boolean; powerRate?: number } = {}): { lanes: Map<number, number>; crashedAt: number | null } {
  const world = new World(new Scene(), new LivePalette());
  const hooked = world as unknown as Hooked;
  const lanes = new Map<number, number>();
  const row = hooked.row.bind(world);
  hooked.row = (d: number) => {
    row(d);
    lanes.set(Math.round(d * 10), hooked.lane);
  };
  world.powerRate = opts.powerRate ?? 1;
  world.reset(CONFIG.field.startClearance, true, 0, seed);
  const start = world.distance;
  let eased = 0;
  let crashedAt: number | null = null;
  for (let t = 0; t < seconds; t += 1 / 60) {
    const score = (world.distance - start) * CONFIG.score.pointsPerUnit;
    const speed = speedAt(score) * (opts.boost && Math.sin(t) > 0 ? CONFIG.boost.speedMultiplier : 1);
    let target = hooked.shipX;
    let gap = Infinity;
    for (const [rd, x] of lanes) {
      const g = Math.abs(rd / 10 - (world.distance + 3));
      if (g < gap) {
        gap = g;
        target = x;
      }
    }
    const steer = opts.weave ? Math.sin(t * 1.7) : Math.max(-1, Math.min(1, (target - hooked.shipX) * 1.5));
    eased += (steer - eased) * (1 - Math.exp(-(CONFIG.steering.response * (world.onIce() ? CONFIG.hazards.ice.grip : 1)) / 60));
    const prev = world.distance;
    world.advance(1 / 60, speed, eased * lateralSpeedAt(speed));
    if (crashedAt === null && (world.overPit() || world.inLava() || world.hitTest(prev))) {
      crashedAt = Math.round(world.distance - start);
      if (!opts.weave) break;
    }
  }
  return { lanes, crashedAt };
}

describe('ranked: the weekly run', () => {
  const weeks = mondays(12).map(weeklyRun);

  it('is the same for everyone in a week, and new each week', () => {
    expect(weeklyRun('2026-10-05')).toEqual(weeklyRun('2026-10-05'));
    expect(new Set(weeks.map((w) => w.seed)).size).toBe(weeks.length);
    expect(weeks[0].name).toBe('week of 5 oct');
  });

  weeks.forEach((w) => {
    it(`${w.name} is survivable`, () => {
      const r = flyEndless(w.seed, 90);
      expect(r.crashedAt, `crashed ${r.crashedAt} units in`).toBeNull();
    });
  });

  // The course depends only on its seed: not on steering, boosting or upgrades.
  it('builds the same course however it is flown', () => {
    const seed = weeks[3].seed;
    const a = flyEndless(seed, 70).lanes;
    const b = flyEndless(seed, 70, { weave: true, boost: true, powerRate: 1.4 }).lanes;
    let compared = 0;
    for (const [d, x] of a) {
      const y = b.get(d);
      if (y === undefined) continue;
      expect(Math.abs(x - y), `row ${d / 10}`).toBeLessThan(1e-6);
      compared++;
    }
    expect(compared).toBeGreaterThan(500);
  });
});
