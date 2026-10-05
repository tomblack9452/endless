import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { COURSES, courseLength } from '../src/courses';
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

function fly(index: number): { finished: boolean; at: number; section: string; room: string } {
  const course = COURSES[index];
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
      const r = fly(i);
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
