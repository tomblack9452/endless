import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { ENVIRONMENTS } from '../src/courses';
import { Progress } from '../src/progress';
import { envStatus, nextEnvironment, newlyOpened, unlockLevel } from '../src/unlocks';
import { themeForLevel } from '../src/world';

// Solo environments open as you reach them in the endless order.

const env = (id: string) => ENVIRONMENTS.find((e) => e.id === id)!;

describe('solo environment unlocks', () => {
  it('open ground is open from the start, the rest wait for their level', () => {
    expect(envStatus(env('open-ground'), 1).open).toBe(true);
    expect(ENVIRONMENTS.filter((e) => envStatus(e, 1).open).map((e) => e.id)).toEqual(['open-ground']);
  });

  it('each opens at the first level its area appears in the endless order', () => {
    // Loop 1: ground, canyon, ship. Loop 2: ice, asteroids, ship. Loop 3: volcanic.
    expect(unlockLevel(env('canyon'))).toBe(4);
    expect(unlockLevel(env('ship'))).toBe(7);
    expect(unlockLevel(env('ice'))).toBe(10);
    expect(unlockLevel(env('asteroids'))).toBe(13);
    expect(unlockLevel(env('volcanic'))).toBe(19);
    // And that really is where the endless run first shows them (the theme at those levels).
    expect(themeForLevel(unlockLevel(env('canyon')))).toBe('canyon');
    expect(themeForLevel(unlockLevel(env('ship')))).toBe('interior');
    expect(themeForLevel(unlockLevel(env('ice')))).toBe('land');
    expect(themeForLevel(unlockLevel(env('asteroids')))).toBe('canyon');
    expect(themeForLevel(unlockLevel(env('volcanic')))).toBe('land');
  });

  it('opens on reaching the level, not before', () => {
    expect(envStatus(env('asteroids'), 12).open).toBe(false);
    expect(envStatus(env('asteroids'), 13).open).toBe(true);
  });

  it('says how far off it is', () => {
    const s = envStatus(env('asteroids'), 10);
    expect(s.toGo).toBe(3);
    expect(s.fraction).toBeCloseTo(0, 5); // just opened ice (level 10): the bar starts there
    expect(envStatus(env('asteroids'), 12).fraction).toBeCloseTo(2 / 3, 5);
    expect(envStatus(env('asteroids'), 13).toGo).toBe(0);
  });

  it('points at the closest locked one, and nothing once all are open', () => {
    expect(nextEnvironment(1)?.env.id).toBe('canyon');
    expect(nextEnvironment(9)?.env.id).toBe('ice');
    expect(nextEnvironment(14)?.env.id).toBe('volcanic');
    expect(nextEnvironment(19)).toBeNull();
  });

  it('lists what a run opened on the way', () => {
    expect(newlyOpened(1, 3)).toEqual([]);
    expect(newlyOpened(3, 4).map((e) => e.id)).toEqual(['canyon']);
    expect(newlyOpened(6, 13).map((e) => e.id)).toEqual(['ship', 'ice', 'asteroids']);
  });

  it('every environment is reachable in the endless order', () => {
    for (const e of ENVIRONMENTS) expect(unlockLevel(e)).toBeLessThanOrEqual(7 * CONFIG.themes.levelsPerTheme);
  });
});

describe('furthest level', () => {
  it('only moves forward, and reports where it was', async () => {
    const p = new Progress();
    expect(p.reachedLevel(5)).toBe(1);
    expect(p.furthest).toBe(5);
    expect(p.reachedLevel(3)).toBe(5);
    expect(p.furthest).toBe(5);
    expect(p.sector).toBe(1);
  });
});
