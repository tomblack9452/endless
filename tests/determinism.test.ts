import { describe, expect, it } from 'vitest';

// A course is its seed: generation may only use the seeded rand() (src/core/rng.ts),
// never Math.random, the clock or frame timing. (Purely visual effects, like
// sparks and weather, live elsewhere and may.) This keeps the weekly level the
// same for everyone and lets a server re-fly a run from its inputs.

const GENERATION = import.meta.glob(['../src/world/world.ts', '../src/world/interior.ts', '../src/world/courses.ts', '../src/world/terrain.ts', '../src/world/pieces/**/*.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('course generation is deterministic', () => {
  it('covers the generator files', () => {
    expect(Object.keys(GENERATION).length).toBeGreaterThan(10);
  });

  for (const [file, src] of Object.entries(GENERATION)) {
    it(`${file.replace('../', '')} uses no unseeded randomness or clock`, () => {
      expect(src.match(/Math\.random|Date\.now|performance\.now/g) ?? []).toEqual([]);
    });
  }
});

// 1.0.9: risk lanes (every mode) and gate runs (endless) come from the course
// seed too, through the second stream (featureRand), whatever the ship does.
import { Scene } from 'three';
import { CONFIG } from '../src/core/config';
import { LivePalette } from '../src/world/palette';
import { World } from '../src/world/world';
import { weeklyRun } from '../src/world/courses';

function layout(seed: number, steer: (t: number) => number, gates: boolean): { risks: string[]; gates: string } {
  const world = new World(new Scene(), new LivePalette());
  world.gateRuns = gates;
  const hooked = world as unknown as { row(d: number): void; altNow: number | null };
  const risks: string[] = [];
  const row = hooked.row.bind(world);
  hooked.row = (d: number) => {
    row(d);
    if (hooked.altNow !== null) risks.push(`${d.toFixed(1)}:${hooked.altNow.toFixed(3)}`);
  };
  world.reset(CONFIG.field.startClearance, true, 0, seed);
  for (let t = 0; t < 60; t += 1 / 30) world.advance(1 / 30, 40 + (t % 7), steer(t));
  return { risks, gates: JSON.stringify(world.gateLog) };
}

describe('risk lanes and gate runs are the seed', () => {
  it("lay the week's ranked run the same however it's flown", () => {
    const seed = weeklyRun('2026-10-19').seed;
    const a = layout(seed, () => 0, false);
    const b = layout(seed, (t) => Math.sin(t * 1.7) * 9, false);
    expect(a.risks.length).toBeGreaterThan(0);
    expect(b.risks).toEqual(a.risks);
  });

  it('lay an endless run\'s gate runs the same however it\'s flown', () => {
    const a = layout(4242, () => 0, true);
    expect(layout(4242, (t) => Math.cos(t) * 6, true).gates).toEqual(a.gates);
  });
});
