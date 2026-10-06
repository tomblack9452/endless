import { describe, expect, it } from 'vitest';
import { progressOn } from '../src/achievements';
import { achievement } from '../src/achievements';
import { LOOKS, VAULT_ORDER } from '../src/catalogue';
import { type Slot, Looks, type Owner, SLOTS, keyOf, itemsIn } from '../src/looks';
import { buildHangar, hullIcon, monthsUntilVault, shortUnlock, type HangarDeps } from '../src/hangar';

// The hangar's cards and what its detail panel offers for each way to get a look.

const owner = (over: Partial<Owner> = {}, snap: Record<string, number> = {}): Owner => ({
  rank: 0,
  stars: 0,
  league: 0,
  premium: false,
  goal: (id) => {
    const a = achievement(id);
    return a
      ? progressOn(a, {
          runs: 0, distance: 0, seconds: 0, nearMisses: 0, bestChain: 0, pickups: 0, crashes: 0, furthest: 1, endlessBest: 0, envBest: {}, coursesDone: 0, stars: 0, upgradePoints: 0, looksOwned: 0,
          ...snap,
        })
      : { have: 0, target: 1, done: false };
  },
  ...over,
});

function deps(over: Partial<HangarDeps> = {}): HangarDeps {
  return { looks: new Looks(), owner: owner(), credits: 0, cores: 0, vault: { key: VAULT_ORDER[0], monthsUntil: () => 3 }, ...over };
}

const view = (slot: Slot, pick: string | null, d = deps()) => buildHangar({ slot, pick }, d);

describe('the hangar', () => {
  it('has every slot, and the counts add up to the whole catalogue', () => {
    const v = view('paint', null);
    expect(v.slots.map((s) => s.slot)).toEqual(SLOTS);
    expect(v.slots.reduce((n, s) => n + s.total, 0)).toBe(LOOKS.length);
    expect(v.slots.filter((s) => s.on).map((s) => s.slot)).toEqual(['paint']);
    for (const s of v.slots) expect(s.owned).toBeGreaterThanOrEqual(1); // the free one
    expect(v.summary).toMatch(/^\d+ of \d+ looks$/);
  });

  it('has a card for every look in the slot, in the catalogue\'s order', () => {
    for (const slot of SLOTS) {
      const v = view(slot, null);
      expect(v.cards.map((c) => c.id)).toEqual(itemsIn(slot).map((i) => i.id));
    }
  });

  it('marks what is on, what is owned and what is locked, and says what a locked one takes', () => {
    const looks = new Looks();
    const d = deps({ looks });
    let v = view('paint', null, d);
    expect(v.cards.find((c) => c.id === 'standard')?.state).toBe('equipped');
    expect(v.cards.find((c) => c.id === 'crimson')?.state).toBe('locked');
    expect(v.cards.find((c) => c.id === 'crimson')?.sub).toBe('300 credits');
    looks.give('paint:crimson');
    v = view('paint', null, d);
    expect(v.cards.find((c) => c.id === 'crimson')?.state).toBe('owned');
    expect(v.cards.find((c) => c.id === 'crimson')?.sub).toBe('');
    looks.equip('paint', 'crimson');
    v = view('paint', null, d);
    expect(v.cards.find((c) => c.id === 'crimson')?.state).toBe('equipped');
    expect(v.cards.find((c) => c.id === 'standard')?.state).toBe('owned');
  });

  it('shows a picture or colours for every card', () => {
    for (const slot of SLOTS) for (const c of view(slot, null).cards) expect(c.swatch ?? c.icon, `${slot}:${c.id}`).toBeTruthy();
  });

  it('offers to put on what you own, and nothing for what is already on', () => {
    const looks = new Looks();
    looks.give('paint:crimson');
    const d = deps({ looks });
    expect(view('paint', 'crimson', d).detail?.action).toMatchObject({ kind: 'equip', enabled: true });
    looks.equip('paint', 'crimson');
    expect(view('paint', 'crimson', d).detail?.action).toMatchObject({ kind: 'none', enabled: false });
    expect(view('paint', 'crimson', d).detail?.status).toBe('on your ship');
  });

  it('offers to buy for credits or cores, only when you can pay', () => {
    expect(view('paint', 'crimson', deps({ credits: 299 })).detail?.action).toMatchObject({ kind: 'buy', enabled: false });
    expect(view('paint', 'crimson', deps({ credits: 300 })).detail?.action).toMatchObject({ kind: 'buy', enabled: true });
    expect(view('paint', 'nebula', deps({ cores: 119 })).detail?.action).toMatchObject({ kind: 'buy', enabled: false });
    expect(view('paint', 'nebula', deps({ cores: 120 })).detail?.action).toMatchObject({ kind: 'buy', enabled: true });
    expect(view('paint', 'nebula', deps({ credits: 1e6 })).detail?.action.enabled).toBe(false); // cores, not credits
  });

  it('sells a vault look only while it is the month\'s', () => {
    const [here, away] = [VAULT_ORDER[0], VAULT_ORDER[1]];
    const [s1, i1] = here.split(':');
    const [s2, i2] = away.split(':');
    const d = deps({ cores: 9999, vault: { key: here, monthsUntil: () => 2 } });
    expect(view(s1 as Slot, i1, d).detail?.action).toMatchObject({ kind: 'buy', enabled: true });
    const gone = view(s2 as Slot, i2, d).detail;
    expect(gone?.action).toMatchObject({ kind: 'none', enabled: false });
    expect(gone?.action.text).toContain('2 months');
    expect(view(s2 as Slot, i2, deps({ vault: { key: here, monthsUntil: () => 1 } })).detail?.action.text).toContain('next month');
  });

  it('shows progress for goals, ranks and stars, and nothing to press', () => {
    const d = deps({ owner: owner({ stars: 3 }, { runs: 20 }) });
    const goal = view('engine', 'orange', d).detail;
    expect(goal?.goal).toEqual({ have: 20, target: 50 });
    expect(goal?.action).toMatchObject({ kind: 'none', enabled: false });
    expect(goal?.status).toContain('fly 50 runs');
    expect(view('paint', 'dawn', d).detail?.goal).toEqual({ have: 3, target: 5 });
    expect(view('paint', 'copper', deps({ owner: owner({ rank: 4 }) })).detail?.goal).toEqual({ have: 4, target: 10 });
    expect(view('paint', 'aurora', d).detail?.goal).toBeNull();
    expect(view('paint', 'aurora', d).detail?.status).toBe('daily login reward');
  });

  it('shows what you are wearing when nothing is picked', () => {
    const looks = new Looks();
    looks.give('paint:crimson');
    looks.equip('paint', 'crimson');
    expect(view('paint', null, deps({ looks })).detail?.name).toBe('crimson');
  });
});

describe('small things', () => {
  it('every look has a short line for its card that is not empty unless it is free', () => {
    for (const l of LOOKS) expect(shortUnlock(l) === '', keyOf(l)).toBe(l.unlock.by === 'free');
  });

  it('draws every hull as an icon', () => {
    for (const h of itemsIn('hull')) {
      const svg = hullIcon(h.id);
      expect(svg).toContain('<svg');
      expect(svg).toContain('<path');
      expect(svg).not.toContain('NaN');
    }
  });

  it('counts months to the vault look', () => {
    expect(monthsUntilVault(VAULT_ORDER[2], VAULT_ORDER, 0)).toBe(2);
    expect(monthsUntilVault(VAULT_ORDER[0], VAULT_ORDER, 0)).toBe(VAULT_ORDER.length);
    expect(monthsUntilVault(VAULT_ORDER[1], VAULT_ORDER, 0)).toBe(1);
    expect(monthsUntilVault('paint:nothing', VAULT_ORDER, 0)).toBe(VAULT_ORDER.length);
  });
});
