import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { Daily, questsFor } from '../src/economy/daily';
import { freeReward, Pass, premiumReward, seasonAt } from '../src/economy/pass';
import { shopFor } from '../src/economy/shop';
import { Tickets } from '../src/economy/tickets';
import { dayBefore, dayKey } from '../src/economy/time';
import { find, LOOKS } from '../src/looks';
import { LivePalette } from '../src/palette';
import { World } from '../src/world';

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 9, 5, 9); // a Monday morning

describe('ranked tickets', () => {
  const week = CONFIG.economy.tickets.perWeek;

  it('give a set each week, all the same week, and a fresh set on Monday', async () => {
    const t = new Tickets();
    await t.load(T0);
    expect(t.count).toBe(week);
    for (let i = 0; i < week; i++) expect(t.use(T0 + i * HOUR)).toBe(true);
    expect(t.use(T0 + 3 * 24 * HOUR)).toBe(false); // still the same week: none come back
    expect(t.nextIn(T0)).toBe(7 * 24 * HOUR - 9 * HOUR);
    t.refill(T0 + 7 * 24 * HOUR);
    expect(t.count).toBe(week);
  });

  it('keep extra tickets into the next week', async () => {
    const t = new Tickets();
    await t.load(T0);
    t.add(3);
    t.refill(T0 + 7 * 24 * HOUR);
    expect(t.count).toBe(week + 3);
  });
});

describe('daily', () => {
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

  it('quests fill from runs and pay the all-done bonus once', async () => {
    const d = new Daily();
    const day = dayKey(T0);
    await d.load(day);
    const big = { ranked: true, score: 1e6, level: 99, nearMisses: 999, pickups: 999, boostSeconds: 999, rooms: 99 };
    let bonus = 0;
    for (let i = 0; i < 6; i++) bonus += d.recordRun(day, big).allDone;
    expect(d.quests.every((q) => q.done)).toBe(true);
    expect(bonus).toBe(CONFIG.economy.quests.allDoneCores);
  });

  it('one free revive a day', async () => {
    const d = new Daily();
    const day = dayKey(T0);
    await d.load(day);
    expect(d.freeRevive(day)).toBe(true);
    d.useFreeRevive(day);
    expect(d.freeRevive(day)).toBe(false);
    expect(d.freeRevive(dayKey(T0 + 24 * HOUR))).toBe(true);
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
