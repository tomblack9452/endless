import { describe, expect, it } from 'vitest';
import SUBMIT from '../supabase/functions/submit-run/index.ts?raw';
import { CONFIG } from '../src/config';
import { createBackend } from '../src/server/backend';

// The submit-run function (supabase/functions) runs on Deno and can't import
// the game's config, so it keeps its own copies of a few numbers. Keep them honest.
function constant(name: string): number {
  const m = new RegExp('const ' + name + ' = ([0-9.]+)').exec(SUBMIT);
  if (!m) throw new Error(`no ${name} in submit-run`);
  return Number(m[1]);
}

describe('server', () => {
  it('runs on the device when no keys are set', async () => {
    const b = createBackend();
    expect(b.online).toBe(false);
    expect(await b.signIn()).toBe(false);
    expect(await b.spendCores(10, 'test')).toBe(true);
  });

  it("submit-run's checks match the game", () => {
    expect(constant('POINTS_PER_UNIT')).toBe(CONFIG.score.pointsPerUnit);
    expect(constant('TOP_SPEED')).toBeGreaterThan(CONFIG.speed.max * CONFIG.boost.speedMultiplier);
    expect(constant('PATH_STEP')).toBe(4);
  });
});
