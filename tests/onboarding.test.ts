import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOOKS } from '../src/catalogue';
import { LESSONS, lessonText, Onboarding, STARTER } from '../src/onboarding';
import { byKey } from '../src/looks';

const data = new Map<string, string>();
beforeEach(() => {
  data.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    key: () => null,
    length: 0,
  };
});
afterEach(() => delete (globalThis as { localStorage?: unknown }).localStorage);

describe('onboarding', () => {
  it('starts new players at the controls, and skips players who have played', async () => {
    const fresh = new Onboarding();
    await fresh.load(false);
    expect(fresh.step).toBe('controls');
    data.clear();
    const old = new Onboarding();
    await old.load(true);
    expect(old.done).toBe(true);
  });

  it('resumes where it stopped, and a cut-short practice run starts again from the controls', async () => {
    const a = new Onboarding();
    await a.load(false);
    a.set('dress');
    const b = new Onboarding();
    await b.load(false);
    expect(b.step).toBe('dress');
    b.set('practice');
    const c = new Onboarding();
    await c.load(false);
    expect(c.step).toBe('controls');
  });

  it('teaches each lesson in words for every control scheme', () => {
    for (const l of LESSONS) for (const c of ['drag', 'sides', 'tilt'] as const) expect(lessonText(l, c).length).toBeGreaterThan(8);
  });

  it('offers a starter set of real looks, three to a slot, with free paints and engines', () => {
    for (const keys of Object.values(STARTER)) {
      expect(keys.length).toBe(3);
      for (const k of keys) expect(byKey(k), k).toBeDefined();
    }
    for (const k of [...STARTER.paint, ...STARTER.engine]) expect(byKey(k)!.unlock.by).toBe('free');
    expect(LOOKS.length).toBeGreaterThan(150);
  });
});
