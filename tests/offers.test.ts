import { describe, expect, it } from 'vitest';
import { boughtPack, type PackInfo, STARTER, starterLeft, storeCard, weeklyPack } from '../src/economy/offers';

const H = 3_600_000;
const packs: PackInfo[] = [
  { id: 'credits_1000', kind: 'credits', bonus: 0 },
  { id: 'credits_10000', kind: 'credits', bonus: 24 },
  { id: 'cores_100', kind: 'cores', bonus: 0 },
  { id: 'cores_2500', kind: 'cores', bonus: 25 },
];

describe('the starter offer', () => {
  it('shows from the 3rd run, counts down 48 hours from when it first showed, then never comes back', () => {
    expect(starterLeft({}, 0, 2, false)).toBeNull();
    expect(starterLeft({}, 0, 3, false)).toBe(STARTER.hours * H);
    expect(starterLeft({ starterAt: 0 }, 10 * H, 9, false)).toBe(38 * H);
    expect(starterLeft({ starterAt: 0 }, 48 * H, 9, false)).toBeNull();
    expect(starterLeft({ starterAt: 0 }, 500 * H, 9, false)).toBeNull();
  });

  it('goes once the pack is owned', () => {
    expect(starterLeft({ starterAt: 0 }, H, 9, true)).toBeNull();
  });
});

describe("the title's store card", () => {
  const base = { canBuy: true, runs: 5, sale: null, starterLeft: null, passWaiting: 0, week: packs[1] };

  it('picks a sale, then the starter offer, then the pass, then the week’s pack', () => {
    const sale = { product: 'credits_10000', label: 'sale', endsAt: 1 };
    expect(storeCard({ ...base, sale, starterLeft: H, passWaiting: 3 })).toEqual({ kind: 'sale', sale });
    expect(storeCard({ ...base, starterLeft: H, passWaiting: 3 })).toEqual({ kind: 'starter', left: H });
    expect(storeCard({ ...base, passWaiting: 3 })).toEqual({ kind: 'pass', waiting: 3 });
    expect(storeCard(base)).toEqual({ kind: 'pack', pack: packs[1] });
  });

  it("stays away in a player's first two runs and where nothing can be bought", () => {
    expect(storeCard({ ...base, runs: 1 })).toBeNull();
    expect(storeCard({ ...base, canBuy: false })).toBeNull();
  });

  it('shows the same best-value pack to everyone in a week, credits and cores in turn', () => {
    const a = weeklyPack('2026-11-02', packs);
    const b = weeklyPack('2026-11-09', packs);
    expect(a?.bonus).toBeGreaterThan(0);
    expect(b?.bonus).toBeGreaterThan(0);
    expect(a?.kind).not.toBe(b?.kind);
    expect(weeklyPack('2026-11-02', packs)).toEqual(a);
  });
});

describe('first purchase doubled', () => {
  it('counts packs bought or refunded, not the starter pack, premium or the pass', () => {
    expect(boughtPack(['starter_pack', 'premium', 'season_pass'])).toBe(false);
    expect(boughtPack(['credits_1000'])).toBe(true);
    expect(boughtPack(['refunded:cores_100'])).toBe(true);
  });
});
