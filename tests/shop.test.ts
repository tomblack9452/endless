import { describe, expect, it } from 'vitest';
import { SETS, VAULT_ORDER } from '../src/catalogue';
import { CONFIG } from '../src/config';
import { coresWorth, DailyShop, setOffer, setOfWeek, shopFor, vaultAt } from '../src/economy/shop';
import { dayKey } from '../src/economy/time';
import { keyOf, LOOKS } from '../src/looks';
import { weekKey } from '../src/leagues';

// The shop's rotation: the day's looks, the week's set and the month's vault,
// all the same for everyone and all on the UTC clock.

const T0 = Date.parse('2026-03-02T09:00:00Z'); // a Monday
const DAY = 86_400_000;
const WEEK = 7 * DAY;

describe('the day', () => {
  it('is the same for everyone on a date and changes with it', () => {
    expect(shopFor('2026-03-02').map((o) => keyOf(o.item))).toEqual(shopFor('2026-03-02').map((o) => keyOf(o.item)));
    const days = new Set<string>();
    for (let i = 0; i < 20; i++) days.add(shopFor(dayKey(T0 + i * DAY)).map((o) => keyOf(o.item)).join());
    expect(days.size).toBeGreaterThan(15);
  });

  it('is four different looks, one a deal, at least one premium, none from the vault or earn-only', () => {
    for (let i = 0; i < 60; i++) {
      const offers = shopFor(dayKey(T0 + i * DAY));
      expect(offers).toHaveLength(CONFIG.economy.shop.slots);
      expect(new Set(offers.map((o) => keyOf(o.item))).size).toBe(offers.length);
      expect(offers.filter((o) => o.deal)).toHaveLength(1);
      expect(offers.some((o) => o.currency === 'cores')).toBe(true);
      expect(offers[0].deal, 'the premium slot is never the deal').toBe(false);
      for (const o of offers) {
        expect(['credits', 'cores']).toContain(o.item.unlock.by);
        expect(o.price).toBeLessThanOrEqual(o.full);
        expect(o.price % (o.currency === 'cores' ? 5 : 50)).toBe(0);
      }
    }
  });

  it('moves what you own to the back, so there is something to buy', () => {
    const day = '2026-03-02';
    const plain = shopFor(day);
    const owned = new Set(plain.map((o) => keyOf(o.item)));
    const next = shopFor(day, (k) => owned.has(k));
    for (const o of next) expect(owned.has(keyOf(o.item)), keyOf(o.item)).toBe(false);
  });

  it('shows owned looks when there is nothing else left', () => {
    const all = shopFor('2026-03-02', () => true);
    expect(all).toHaveLength(CONFIG.economy.shop.slots);
  });

  it('keeps the day\'s picks when you buy one, and changes at midnight', () => {
    const shop = new DailyShop();
    const owned = new Set<string>();
    const first = shop.offers('2026-03-02', (k) => owned.has(k));
    owned.add(keyOf(first[0].item)); // buy the first
    const again = shop.offers('2026-03-02', (k) => owned.has(k));
    expect(again.map((o) => keyOf(o.item))).toEqual(first.map((o) => keyOf(o.item)));
    expect(again.map((o) => o.deal)).toEqual(first.map((o) => o.deal));
    const tomorrow = shop.offers('2026-03-03', (k) => owned.has(k));
    expect(tomorrow.map((o) => keyOf(o.item))).not.toEqual(first.map((o) => keyOf(o.item)));
  });
});

describe('the weekly set', () => {
  // Cycles of the sets start on a fixed Monday (2024-01-01), a whole number of cycles on from it.
  const START = Date.parse('2024-01-01T00:00:00Z') + 100 * SETS.length * WEEK;
  const week = (n: number) => weekKey(START + n * WEEK);

  it('is the same for everyone in a week', () => {
    for (let i = 0; i < 8; i++) expect(setOfWeek(weekKey(START + i * WEEK + 3 * DAY)).id).toBe(setOfWeek(week(i)).id);
  });

  it('shows every set once before any comes round again, and never the same set twice running', () => {
    const len = SETS.length;
    for (let cycle = 0; cycle < 6; cycle++) {
      const ids = Array.from({ length: len }, (_, i) => setOfWeek(week(cycle * len + i)).id);
      expect(new Set(ids).size, `cycle ${cycle}`).toBe(len);
    }
    for (let i = 0; i < 60; i++) expect(setOfWeek(week(i)).id).not.toBe(setOfWeek(week(i + 1)).id);
  });

  it('prices only what you are missing, below buying them one by one', () => {
    const w = week(0);
    const full = setOffer(w, () => false);
    expect(full.missing).toHaveLength(full.set.items.length);
    expect(full.complete).toBe(false);
    expect(full.price).toBeLessThan(full.full);
    expect(full.price).toBeGreaterThanOrEqual(Math.round(full.full * CONFIG.economy.shop.setDiscount) - 5);
    expect(full.price % 5).toBe(0);

    const have = new Set(full.set.items.slice(0, 2));
    const part = setOffer(w, (k) => have.has(k));
    expect(part.missing).toHaveLength(full.set.items.length - 2);
    expect(part.price).toBeLessThan(full.price);

    const done = setOffer(w, () => true);
    expect(done.complete).toBe(true);
    expect(done.price).toBe(0);
    expect(done.missing).toHaveLength(0);
  });

  it('mixes credits and cores fairly: a credit look is worth fewer cores', () => {
    const paint = LOOKS.find((l) => l.unlock.by === 'credits' && l.slot === 'paint')!;
    const premium = LOOKS.find((l) => l.unlock.by === 'cores' && l.slot === 'paint')!;
    expect(coresWorth(paint)).toBeLessThan(coresWorth(premium));
    expect(coresWorth(premium)).toBe((premium.unlock as { cost: number }).cost);
  });
});

describe('the vault', () => {
  it('has one look a month, the same for everyone, from the vault', () => {
    const a = vaultAt(Date.parse('2026-03-02T00:00:00Z'));
    const b = vaultAt(Date.parse('2026-03-31T23:59:00Z'));
    expect(keyOf(a.item)).toBe(keyOf(b.item));
    expect(a.item.unlock.by).toBe('vault');
    expect(a.price).toBeGreaterThan(0);
    expect(a.leaves).toBeGreaterThan(0);
    expect(b.leaves).toBeLessThanOrEqual(60_000);
  });

  it('goes through every vault look in turn, then round again', () => {
    const seen: string[] = [];
    for (let m = 0; m < VAULT_ORDER.length * 2; m++) seen.push(keyOf(vaultAt(Date.UTC(2026, m, 15)).item));
    expect(new Set(seen.slice(0, VAULT_ORDER.length)).size).toBe(VAULT_ORDER.length);
    expect(seen.slice(0, VAULT_ORDER.length)).toEqual(seen.slice(VAULT_ORDER.length));
    expect(new Set(seen).size).toBe(VAULT_ORDER.length);
    // The next month is a different look.
    expect(keyOf(vaultAt(Date.UTC(2026, 0, 15)).item)).not.toBe(keyOf(vaultAt(Date.UTC(2026, 1, 15)).item));
  });

  it('counts down to the first of the next month, across a year end', () => {
    const v = vaultAt(Date.UTC(2026, 11, 31, 12));
    expect(v.leaves).toBe(12 * 3600_000);
  });
});
