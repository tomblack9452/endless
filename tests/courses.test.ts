import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { type Course, COURSES, courseLength, ENVIRONMENTS, weeklyCourse } from '../src/courses';
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
  for (let t = 0; t < 600 && world.distance < world.finishAt; t += DT) {
    const section = world.sectionAt(world.distance)!;
    const speed = speedAt(section.difficulty);
    const steer = Math.max(-1, Math.min(1, (laneAt(world.distance + 3) - hooked.shipX) * 1.5));
    const prev = world.distance;
    world.advance(DT, speed, steer * lateralSpeedAt(speed));
    if (world.overPit() || world.hitTest(prev)) {
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

// The weekly ranked level: twelve weeks in a row (two full turns of the
// environment cycle), each finishable, starting somewhere different each week.
function mondays(n: number): string[] {
  const out: string[] = [];
  const d = new Date(2026, 9, 5); // a Monday
  for (let i = 0; i < n; i++) {
    const pad = (v: number) => String(v).padStart(2, '0');
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    d.setDate(d.getDate() + 7);
  }
  return out;
}

describe('weekly ranked level', () => {
  const weeks = mondays(12).map((m) => weeklyCourse(m));

  it('starts in a different environment each week, through all six', () => {
    const starts = weeks.slice(0, 6).map((w) => `${w.sections[0].theme}/${w.sections[0].biome}`);
    expect(new Set(starts).size).toBe(6);
  });

  it('is the same course for everyone in a given week', () => {
    expect(JSON.stringify(weeklyCourse('2026-10-05'))).toBe(JSON.stringify(weeklyCourse('2026-10-05')));
  });

  it('runs about 2-4 minutes', () => {
    for (const w of weeks) {
      const seconds = w.sections.reduce((t, s) => t + s.length / speedAt(s.difficulty), 0);
      expect(seconds, w.name).toBeGreaterThan(100);
      expect(seconds, w.name).toBeLessThan(260);
    }
  });

  weeks.forEach((w) => {
    it(`${w.name} can be flown to the finish`, () => {
      const r = fly(w);
      expect(r.finished, `crashed ${r.at} of ${courseLength(w)} units in, in ${r.section}${r.room ? ` (${r.room})` : ''}`).toBe(true);
    });
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
          world.advance(1 / 60, speed, Math.max(-1, Math.min(1, (target - hooked.shipX) * 1.5)) * lateralSpeedAt(speed));
          crashed = world.overPit() || world.hitTest(prev);
        }
        expect(crashed, `${env.name}, seed ${seed}`).toBe(false);
      }
    });
  });
});
