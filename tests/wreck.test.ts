import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { type Course, courseLength, wreckRun } from '../src/world/courses';
import { lateralSpeedAt, speedAt } from '../src/world/difficulty';
import { LivePalette } from '../src/world/palette';
import { terrain } from '../src/world/terrain';
import { World } from '../src/world/world';

// Hunt through the wreckage: hard, never impossible. The autopilot follows the
// safe lane at each stretch's speed from the hangar to the finish, for many weeks' courses.

interface Hooked {
  row(d: number): void;
  lane: number;
  shipX: number;
}

let spawned: Record<string, number> = {};

function fly(course: Course): { finished: boolean; at: number; section: string; room: string; depth: number } {
  const world = new World(new Scene(), new LivePalette());
  const hooked = world as unknown as Hooked;
  const lanes: [number, number][] = [];
  const row = hooked.row.bind(world);
  hooked.row = (d: number) => {
    row(d);
    lanes.push([d, hooked.lane]);
    if (lanes.length > 800) lanes.shift();
  };
  const counts: Record<string, number> = {};
  const parts = world as unknown as Record<string, { spawn: (...a: unknown[]) => void }>;
  for (const name of ['wreckChunks', 'wreckSlabs', 'wreckRibs', 'lavaBombs', 'vents']) {
    const f = parts[name];
    const spawn = f.spawn.bind(f);
    counts[name] = 0;
    f.spawn = (...a: unknown[]) => {
      counts[name]++;
      spawn(...a);
    };
  }
  spawned = counts;
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
  let eased = 0;
  let depth = 0;
  for (let t = 0; t < 600 && world.distance < world.finishAt; t += DT) {
    const section = world.sectionAt(world.distance)!;
    const speed = speedAt(section.difficulty);
    const steer = Math.max(-1, Math.min(1, (laneAt(world.distance + 3) - hooked.shipX) * 1.5));
    const prev = world.distance;
    eased += (steer - eased) * (1 - Math.exp(-CONFIG.steering.response * DT));
    world.advance(DT, speed, eased * lateralSpeedAt(speed));
    depth = Math.min(depth, terrain.heightAt(world.distance));
    if (world.overPit() || world.inLava() || world.hitTest(prev)) {
      return { finished: false, at: Math.round(world.distance - start), section: section.name, room: world.roomName, depth };
    }
  }
  return { finished: world.distance >= world.finishAt, at: Math.round(world.distance - start), section: '', room: '', depth };
}

const MONDAYS = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, 10, 2) + i * 7 * 86_400_000).toISOString().slice(0, 10));

describe('hunt through the wreckage', () => {
  for (const monday of MONDAYS) {
    it(`the week of ${monday} can be flown to the finish`, () => {
      const c = wreckRun(monday);
      const r = fly(c);
      expect(r.finished, `crashed ${r.at} of ${courseLength(c)} units in, in ${r.section}${r.room ? ` (${r.room})` : ''}`).toBe(true);
    });
  }

  it('dives deep, and has its wreckage, ribs, fire vents and burning debris', () => {
    const r = fly(wreckRun(MONDAYS[0]));
    expect(r.depth).toBeLessThan(-25);
    for (const [name, n] of Object.entries(spawned)) expect(n, name).toBeGreaterThan(3);
  });

  it('is a new course each week and the same all week', () => {
    expect(wreckRun(MONDAYS[0]).seed).toBe(wreckRun(MONDAYS[0]).seed);
    expect(wreckRun(MONDAYS[0]).seed).not.toBe(wreckRun(MONDAYS[1]).seed);
  });

  it("runs about two minutes at each stretch's speed", () => {
    const c = wreckRun(MONDAYS[0]);
    const seconds = c.sections.reduce((t, s) => t + s.length / speedAt(s.difficulty), 0);
    expect(seconds).toBeGreaterThan(90);
    expect(seconds).toBeLessThan(160);
  });
});
