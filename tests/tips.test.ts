import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AFTER, GAP_MS, Hints, mayShow, SHOW_MS, type TipState, TIPS, tipText, walkthroughDone } from '../src/ui/hints';

const data = new Map<string, string>();
let now = 0;
beforeEach(() => {
  data.clear();
  now = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    key: () => null,
    length: 0,
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

const fresh = (): TipState => ({ seen: new Set(), skipped: false });

describe('walkthrough order', () => {
  it('starts with steering, and every tip builds on one that comes earlier', () => {
    expect(TIPS[0]).toBe('steer');
    expect(AFTER.steer).toBeNull();
    for (const t of TIPS.slice(1)) {
      const before = AFTER[t];
      expect(before).not.toBeNull();
      expect(TIPS.indexOf(before!)).toBeLessThan(TIPS.indexOf(t));
    }
  });

  it('holds a tip back until the one it builds on has shown', () => {
    const st = fresh();
    expect(mayShow('avoid', st, 0, 0)).toBe(false);
    expect(mayShow('nearMiss', st, 0, 0)).toBe(false);
    expect(mayShow('steer', st, 0, 0)).toBe(true);
    st.seen.add('steer');
    expect(mayShow('avoid', st, 0, 0)).toBe(true);
    expect(mayShow('pickup', st, 0, 0)).toBe(false);
    st.seen.add('avoid');
    expect(mayShow('nearMiss', st, 0, 0)).toBe(true);
    expect(mayShow('pickup', st, 0, 0)).toBe(true);
    expect(mayShow('power', st, 0, 0)).toBe(false);
    expect(mayShow('boost', st, 0, 0)).toBe(false);
  });

  it('shows nothing over another hint, nothing twice, and nothing after skip tips', () => {
    const st = fresh();
    expect(mayShow('steer', st, 100, 200)).toBe(false);
    st.seen.add('steer');
    expect(mayShow('steer', st, 0, 0)).toBe(false);
    st.skipped = true;
    expect(mayShow('avoid', st, 0, 0)).toBe(false);
    expect(walkthroughDone(st)).toBe(true);
  });

  it('lets the pits hint through at any point in the order', () => {
    expect(mayShow('pits', fresh(), 0, 0)).toBe(true);
  });
});

describe('tip wording', () => {
  it('names the steering in use', () => {
    expect(tipText('steer', 'tilt')).toContain('tilt');
    expect(tipText('steer', 'drag')).toContain('drag');
    expect(tipText('steer', 'sides')).toContain('side');
    expect(tipText('steer', 'drag', { keys: true })).toContain('arrow keys');
  });

  it('only mentions double-tap when it is on', () => {
    expect(tipText('boost', 'drag', { doubleTap: true })).toContain('double-tap');
    expect(tipText('boost', 'drag', { doubleTap: false })).not.toContain('double-tap');
  });

  it('covers steering, obstacles, near misses and chains, pickups and power-ups', () => {
    const all = TIPS.map((t) => tipText(t, 'drag')).join(' ');
    for (const word of ['steer', 'hit', 'near miss', 'chain', 'pickups', 'power-up', 'boost']) expect(all).toContain(word);
  });
});

describe('hints', () => {
  it('runs a new player through every tip, once each, with a gap between them', async () => {
    const shown: string[] = [];
    const h = new Hints((text, tip) => tip && shown.push(text));
    await h.load(false);
    expect(h.active).toBe(true);
    expect(h.offer('avoid', 'avoid')).toBe(false); // not before steering
    expect(h.offer('steer', 'steer')).toBe(true);
    expect(h.offer('steer', 'steer')).toBe(false); // once
    expect(h.offer('avoid', 'avoid')).toBe(false); // the steer tip is still up
    now += SHOW_MS + GAP_MS;
    for (const t of TIPS.slice(1)) {
      expect(h.offer(t, t)).toBe(true);
      now += SHOW_MS + GAP_MS;
    }
    expect(shown).toEqual(TIPS);
    expect(h.active).toBe(false);
    // Remembered: a new session shows none of them.
    const again = new Hints(() => undefined);
    await again.load(false);
    expect(again.active).toBe(false);
  });

  it('never shows the walkthrough to a player who already has runs, unless replayed', async () => {
    const h = new Hints(() => undefined);
    await h.load(true);
    expect(h.active).toBe(false);
    expect(h.offer('steer', 'steer')).toBe(false);
    h.replay();
    expect(h.active).toBe(true);
    expect(h.offer('steer', 'steer')).toBe(true);
  });

  it('keeps a returning player who started the walkthrough on it', async () => {
    const a = new Hints(() => undefined);
    await a.load(false);
    a.offer('steer', 'steer');
    const b = new Hints(() => undefined);
    await b.load(true); // has runs now, but the walkthrough was already under way
    expect(b.active).toBe(true);
    now += SHOW_MS + GAP_MS;
    expect(b.offer('steer', 'steer')).toBe(false);
    expect(b.offer('avoid', 'avoid')).toBe(true);
  });

  it('stops for good on skip tips, and comes back on replay', async () => {
    const h = new Hints(() => undefined);
    await h.load(false);
    h.offer('steer', 'steer');
    h.skip();
    now += SHOW_MS + GAP_MS;
    expect(h.offer('avoid', 'avoid')).toBe(false);
    const later = new Hints(() => undefined);
    await later.load(false);
    expect(later.active).toBe(false);
    later.replay();
    expect(later.offer('steer', 'steer')).toBe(true);
  });

  it('skips what the practice run taught', async () => {
    const shown: string[] = [];
    const h = new Hints((text) => shown.push(text));
    await h.load(false);
    h.learned(['steer', 'nearMiss', 'pickup', 'boost']);
    expect(h.offer('steer', 'steer')).toBe(false);
    expect(h.offer('avoid', 'avoid')).toBe(true);
    now += SHOW_MS + GAP_MS;
    expect(h.offer('power', 'power')).toBe(true);
    expect(shown).toEqual(['avoid', 'power']);
  });

  it('says nothing before the save has loaded', () => {
    const h = new Hints(() => undefined);
    expect(h.offer('steer', 'steer')).toBe(false);
  });

  it('keeps the old pits hint seen', async () => {
    data.set('endless.hints', JSON.stringify(['steer', 'pits']));
    const h = new Hints(() => undefined);
    await h.load(false);
    expect(h.offer('pits', 'pits')).toBe(false);
    expect(h.offer('steer', 'steer')).toBe(true); // the walkthrough is new, even if the old steer hint showed
  });
});
