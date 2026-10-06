import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { Daily, questsFor, questText } from '../src/economy/daily';
import { Weekly, weeklyFor } from '../src/economy/weekly';
import { freeReward, Pass, premiumReward, seasonAt } from '../src/economy/pass';
import { shopFor } from '../src/economy/shop';
import { dayBefore, dayKey } from '../src/economy/time';
import { find, LOOKS } from '../src/looks';
import { LivePalette } from '../src/palette';
import { World } from '../src/world';

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 9, 5, 9); // a Monday morning

describe('daily', () => {
  it('words ranked goals as any run until ranked opens', () => {
    const q = { type: 'ranked' as const, target: 2, progress: 0, credits: 100, done: false };
    expect(questText(q)).toBe('play 2 ranked runs');
    expect(questText(q, false)).toMatch(/any mode until ranked opens/);
    expect(questText({ ...q, type: 'beatPar', target: 1 }, false)).toMatch(/bronze par/);
  });

  it('quests are the same for everyone on a day, different types, and change day to day', () => {
    const a = questsFor('2026-10-05');
    expect(JSON.stringify(a)).toBe(JSON.stringify(questsFor('2026-10-05')));
    expect(new Set(a.map((q) => q.type)).size).toBe(CONFIG.economy.quests.count);
    const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map((d) => JSON.stringify(questsFor(d)));
    expect(new Set(days).size).toBeGreaterThan(1);
  });

  it('login calendar: one claim a day, walking through the week', async () => {
    const d = new Daily();
    const day = dayKey(T0);
    await d.load(day);
    expect(d.claimLogin(day)).toEqual(CONFIG.economy.login[0]);
    expect(d.claimLogin(day)).toBeNull();
    const next = dayKey(T0 + 24 * HOUR);
    expect(dayBefore(next)).toBe(day);
    expect(d.claimLogin(next)).toEqual(CONFIG.economy.login[1]);
  });

  it('quests fill from runs, are claimed with a tap, and the all-three bonus once', async () => {
    const d = new Daily();
    const day = dayKey(T0);
    await d.load(day);
    const big = { ranked: true, score: 1e6, level: 99, nearMisses: 999, pickups: 999, boostSeconds: 999, rooms: 99 };
    for (let i = 0; i < 6; i++) d.recordRun(day, big);
    expect(d.quests.every((q) => q.done)).toBe(true);
    expect(d.claimable).toBe(3);
    expect(d.claimBonus()).toBe(0); // not before the three are claimed
    for (let i = 0; i < 3; i++) expect(d.claim(i)?.credits).toBeGreaterThan(0);
    expect(d.claim(0)).toBeNull(); // once
    expect(d.claimable).toBe(1); // the bonus
    expect(d.claimBonus()).toBe(CONFIG.economy.quests.allDoneCores);
    expect(d.claimBonus()).toBe(0);
    expect(d.claimable).toBe(0);
  });

  it('weekly goals: five, the same for everyone, bigger, and claimed like quests', async () => {
    const a = weeklyFor('2026-10-05');
    expect(JSON.stringify(a)).toBe(JSON.stringify(weeklyFor('2026-10-05')));
    expect(a.length).toBe(CONFIG.economy.weekly.count);
    expect(new Set(a.map((q) => q.type)).size).toBe(a.length);
    const weeks = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'].map((w) => JSON.stringify(weeklyFor(w)));
    expect(new Set(weeks).size).toBeGreaterThan(1);
    const w = new Weekly();
    await w.load('2026-10-05');
    const big = { ranked: true, score: 1e6, level: 99, nearMisses: 999, pickups: 999, boostSeconds: 999, rooms: 99, beatPar: true };
    for (let i = 0; i < 80; i++) w.recordRun('2026-10-05', big);
    expect(w.claimable).toBe(5);
    for (let i = 0; i < 5; i++) expect(w.claim(i)).not.toBeNull();
    expect(w.claimBonus()).toBe(CONFIG.economy.weekly.allDoneCores);
    w.turn('2026-10-12');
    expect(w.goals.every((q) => !q.done)).toBe(true);
  });

  it('a daily goal can be swapped once a day, and the gift taken once a day', async () => {
    const d = new Daily();
    const day = dayKey(T0);
    await d.load(day);
    const before = d.quests.map((q) => q.type);
    const q = d.reroll(0, day);
    expect(q).not.toBeNull();
    expect(before).not.toContain(q!.type);
    expect(new Set(d.quests.map((x) => x.type)).size).toBe(d.quests.length);
    expect(d.reroll(1, day)).toBeNull();
    expect(d.canReroll(dayKey(T0 + 24 * HOUR))).toBe(true);
    expect(d.giftReady(day)).toBe(true);
    d.takeGift(day);
    expect(d.giftReady(day)).toBe(false);
  });

  it('a finished quest in an older save counts as already paid', async () => {
    const store = new Map<string, string>([['endless.daily', JSON.stringify({ questDay: '2026-10-05', quests: [{ type: 'runs', target: 3, progress: 3, credits: 100, done: true }], allDonePaid: true })]]);
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), key: () => null, length: 0 };
    const d = new Daily();
    await d.load('2026-10-05');
    expect(d.claimable).toBe(0);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('free revives a day: one, or more for premium', async () => {
    const d = new Daily();
    const day = dayKey(T0);
    await d.load(day);
    expect(d.freeRevivesLeft(day)).toBe(1);
    d.useFreeRevive(day);
    expect(d.freeRevivesLeft(day)).toBe(0);
    expect(d.freeRevivesLeft(day, 2)).toBe(1); // premium's extra one
    d.useFreeRevive(day);
    expect(d.freeRevivesLeft(day, 2)).toBe(0);
    expect(d.freeRevivesLeft(dayKey(T0 + 24 * HOUR))).toBe(1);
  });
});

describe('shop', () => {
  it('sells real, distinct looks for credits or cores, with a premium one every day', () => {
    for (let i = 0; i < 60; i++) {
      const offers = shopFor(dayKey(T0 + i * 24 * HOUR));
      expect(offers.length).toBe(CONFIG.economy.shop.slots);
      expect(new Set(offers.map((o) => o.item)).size).toBe(offers.length);
      expect(offers.some((o) => o.currency === 'cores')).toBe(true);
      expect(offers.filter((o) => o.deal).length).toBe(1);
      for (const o of offers) {
        expect(LOOKS).toContain(o.item);
        expect(o.price).toBeGreaterThan(0);
        expect(o.price).toBeLessThanOrEqual(o.full);
      }
    }
  });
});

describe('season pass', () => {
  it('seasons are back to back, six weeks long', () => {
    const a = seasonAt(T0);
    const b = seasonAt(a.end);
    expect(b.season).toBe(a.season + 1);
    expect(b.start).toBe(a.end);
    expect(a.end - a.start).toBe(CONFIG.economy.pass.weeks * 7 * 24 * HOUR);
  });

  it('every reward look exists, and every tier pays on both tracks', () => {
    for (let t = 1; t <= CONFIG.economy.pass.tiers; t++) {
      for (const r of [freeReward(t), premiumReward(t)]) {
        expect(Object.keys(r).length).toBeGreaterThan(0);
        if (r.look) {
          const [slot, id] = r.look.split(':');
          expect(find(slot as never, id).id).toBe(id);
        }
      }
    }
    for (const r of CONFIG.economy.login) {
      if ('look' in r) {
        const [slot, id] = r.look.split(':');
        expect(find(slot as never, id).id).toBe(id);
      }
    }
  });

  it('pays each tier once, and premium pays back tiers already reached', async () => {
    const p = new Pass();
    await p.load(T0);
    const P = CONFIG.economy.pass;
    expect(p.addXp(T0, P.xpPerTier * 3).length).toBe(3);
    expect(p.addXp(T0, 1).length).toBe(0);
    expect(p.unlockPremium().length).toBe(3);
    expect(p.addXp(T0, P.xpPerTier).length).toBe(2);
    expect(p.addXp(T0, P.xpPerTier * 100).length).toBe((P.tiers - 4) * 2);
    expect(p.tier).toBe(P.tiers);
  });
});

describe('revive', () => {
  it('puts the ship on the lane with nothing solid near it just ahead', () => {
    for (const seed of [5, 23, 71]) {
      const world = new World(new Scene(), new LivePalette());
      world.reset(CONFIG.field.startClearance, true, 4000, seed);
      for (let t = 0; t < 8; t += 1 / 60) world.advance(1 / 60, 24, Math.sin(t) * 6); // weave off the lane
      world.revive(CONFIG.economy.revive.clearAhead);
      expect(Math.abs(world.lateral - (world.laneAt(world.distance) ?? NaN))).toBeLessThan(1e-6);
      // Fly straight down the lane for a moment: no hits, no pits.
      for (let t = 0; t < 0.8; t += 1 / 60) {
        const prev = world.distance;
        const lane = world.laneAt(world.distance + 1) ?? world.lateral;
        world.advance(1 / 60, 24, (lane - world.lateral) * 60);
        expect(world.hitTest(prev) || world.overPit(), `seed ${seed}`).toBe(false);
      }
    }
  });
});

describe('pass saves from before tiers took 600 xp', () => {
  it('keep their tier', async () => {
    const store = new Map<string, string>([['endless.pass', JSON.stringify({ season: seasonAt(T0).season, xp: 1300, premium: false, paidFree: 10, paidPremium: 0 })]]);
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      key: () => null,
      length: 0,
    };
    const p = new Pass();
    await p.load(T0);
    expect(p.tier).toBe(10);
    expect(p.addXp(T0, 0)).toEqual([]); // nothing paid twice
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});
