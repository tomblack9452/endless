import { describe, expect, it } from 'vitest';

// A course is its seed: generation may only use the seeded rand() (src/rng.ts),
// never Math.random, the clock or frame timing. (Purely visual effects, like
// sparks and weather, live elsewhere and may.) This keeps the weekly level the
// same for everyone and lets a server re-fly a run from its inputs.

const GENERATION = import.meta.glob(['../src/world.ts', '../src/interior.ts', '../src/courses.ts', '../src/terrain.ts', '../src/pieces/**/*.ts'], {
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
