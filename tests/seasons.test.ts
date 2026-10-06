import { describe, expect, it } from 'vitest';
import { LOOKS } from '../src/catalogue';
import { CONFIG } from '../src/config';
import { decalArt } from '../src/decals';
import { freeReward, premiumReward } from '../src/economy/pass';
import { shopFor } from '../src/economy/shop';
import { byKey } from '../src/looks';
import { seasonAt } from '../src/season';
import { colourDistance, isSeasonShopLook, lab, MIN_DISTANCE, seasonDecalSvg, seasonLooks, seasonLooksThrough, seasonOf, seasonPassKeys, seasonTheme } from '../src/seasonLooks';

// Generated season looks: the same for everyone, distinct, readable, and kept for good.

const HAND_MADE = LOOKS.filter((l) => seasonOf(l.id) === null);
const SEASONS = 40;
const ALL = seasonLooksThrough(SEASONS, HAND_MADE);

describe('season looks', () => {
  it('are the same every time for a season', () => {
    expect(JSON.stringify(seasonLooks(7, HAND_MADE))).toBe(JSON.stringify(seasonLooks(7, HAND_MADE)));
    expect(seasonDecalSvg(7)).toBe(seasonDecalSvg(7));
    expect(seasonTheme(7)).toEqual(seasonTheme(7));
  });

  it('make nine a season (season 1: the four shop looks only)', () => {
    expect(seasonLooks(1, HAND_MADE).length).toBe(4);
    for (let s = 2; s <= SEASONS; s++) expect(seasonLooks(s, HAND_MADE).length, `season ${s}`).toBe(9);
  });

  it('have ids no one else uses, that name their season', () => {
    const keys = [...HAND_MADE, ...ALL].map((l) => `${l.slot}:${l.id}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const l of ALL) expect(seasonOf(l.id), l.id).toBeGreaterThan(0);
  });

  it('have names that repeat nothing in their slot', () => {
    const names = [...HAND_MADE, ...ALL].map((l) => `${l.slot}:${l.name}`);
    expect(new Set(names).size).toBe(names.length);
  });

  it('keep their colours clear of the hand-made ones and readable', () => {
    for (const l of ALL) {
      if (!l.colors) continue;
      for (const c of l.colors) expect(c, l.id).toMatch(/^#[0-9a-f]{6}$/);
      const near = HAND_MADE.filter((h) => h.slot === l.slot && h.colors).map((h) => colourDistance(h.colors![0], l.colors![0]));
      expect(Math.min(...near), `${l.slot}:${l.id}`).toBeGreaterThanOrEqual(MIN_DISTANCE - 0.01);
      if (l.slot === 'paint') expect(lab(l.colors[0])[0], `${l.id} top lighter than shade`).toBeGreaterThan(lab(l.colors[1])[0]);
    }
  });

  it('step round the colour wheel, so neighbouring seasons differ', () => {
    for (let s = 2; s < SEASONS; s++) {
      const a = seasonLooks(s, HAND_MADE).find((l) => l.id.endsWith('-p1'))!;
      const b = seasonLooks(s + 1, HAND_MADE).find((l) => l.id.endsWith('-p1'))!;
      expect(colourDistance(a.colors![0], b.colors![0]), `seasons ${s} and ${s + 1}`).toBeGreaterThan(10);
    }
  });

  it('draw a decal for every season, inside its box', () => {
    for (let s = 2; s <= SEASONS; s++) {
      const svg = seasonDecalSvg(s);
      expect(svg).toMatch(/^<svg[^>]*viewBox="0 0 24 24">/);
      expect(svg).toMatch(/currentColor/);
      for (const n of svg.replace(/xmlns="[^"]*"/, '').match(/-?\d+(\.\d+)?/g)!.map(Number)) expect(Math.abs(n)).toBeLessThanOrEqual(24);
      expect(decalArt(`s${s}-d1`)).toBe(svg);
    }
  });

  it('price the shop looks between 2,000 and 20,000 credits', () => {
    for (const l of ALL.filter((x) => x.unlock.by === 'credits')) {
      const cost = (l.unlock as { cost: number }).cost;
      expect(cost).toBeGreaterThanOrEqual(2000);
      expect(cost).toBeLessThanOrEqual(20000);
    }
  });

  it('can be renamed, recoloured or vetoed in config', () => {
    const o = CONFIG.seasons.overrides;
    o['paint:s3-p1'] = { name: 'harbour light', colors: ['#7fb8e6', '#4f84b5'] };
    o['decal:s3-d1'] = { veto: true };
    try {
      const s3 = seasonLooks(3, HAND_MADE);
      expect(s3.find((l) => l.id === 's3-p1')).toMatchObject({ name: 'harbour light', colors: ['#7fb8e6', '#4f84b5'] });
      expect(s3.find((l) => l.id === 's3-d1')).toBeUndefined();
    } finally {
      delete o['paint:s3-p1'];
      delete o['decal:s3-d1'];
    }
  });
});

describe('in the game', () => {
  it('are in the catalogue up to the current season, findable by key', () => {
    const now = seasonAt(Date.now()).season;
    const inCatalogue = LOOKS.filter((l) => seasonOf(l.id) !== null);
    expect(inCatalogue.length).toBe(seasonLooksThrough(now, HAND_MADE).length);
    for (const l of inCatalogue) expect(byKey(`${l.slot}:${l.id}`)).toBe(l);
  });

  it('are the pass rewards from season 2, and season 1 keeps its hand-made ones', () => {
    expect(premiumReward(10, 1)).toEqual({ look: 'paint:frost' });
    const k = seasonPassKeys(5);
    expect(premiumReward(10, 5)).toEqual({ look: k.p1 });
    expect(premiumReward(15, 5)).toEqual({ look: k.e1 });
    expect(premiumReward(20, 5)).toEqual({ look: k.d1 });
    expect(premiumReward(30, 5)).toMatchObject({ look: k.p2, cores: 50 });
    expect(freeReward(25, 5)).toEqual({ look: k.f1 });
    expect(freeReward(25, 1)).toEqual({ cores: 5 });
  });

  it('are featured in the daily shop during their season', () => {
    const season = seasonAt(Date.now()).season;
    const offers = shopFor(new Date().toISOString().slice(0, 10));
    expect(offers.some((o) => isSeasonShopLook(o.item, season))).toBe(true);
  });
});
