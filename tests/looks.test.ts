import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, achievement, doneIn, evaluate, GROUP_NAMES, progressOn, rewardKeys, type Snapshot } from '../src/achievements';
import { LOOKS, SETS, SLOT_ORDER, VAULT_ORDER } from '../src/catalogue';
import { COURSES, ENVIRONMENTS } from '../src/courses';
import { LEAGUES } from '../src/leagues';
import { buyable, byKey, itemsIn, keyOf, Looks, type LookItem, type Owner, SLOT_NAMES, SLOTS, unlockProgress, unlockText } from '../src/looks';
import { RANKS } from '../src/ranks';

// The catalogue of looks and the goals that unlock some of them: every way to
// get an item has to be a real, reachable thing.

const BLANK: Snapshot = {
  runs: 0,
  distance: 0,
  seconds: 0,
  nearMisses: 0,
  bestChain: 0,
  pickups: 0,
  crashes: 0,
  furthest: 1,
  endlessBest: 0,
  envBest: {},
  coursesDone: 0,
  stars: 0,
  upgradePoints: 0,
  looksOwned: 0,
};

const MAXED: Snapshot = {
  runs: 1e6,
  distance: 1e9,
  seconds: 1e9,
  nearMisses: 1e9,
  bestChain: 100,
  pickups: 1e9,
  crashes: 1e9,
  furthest: 100,
  endlessBest: 1e9,
  envBest: Object.fromEntries(ENVIRONMENTS.map((e) => [e.id, 1e9])),
  coursesDone: COURSES.length,
  stars: 1000,
  upgradePoints: 30,
  looksOwned: 1000,
};

function owner(snap: Snapshot, extra: Partial<Owner> = {}): Owner {
  return {
    rank: 0,
    stars: snap.stars,
    league: 0,
    goal: (id) => {
      const a = achievement(id);
      return a ? progressOn(a, snap) : { have: 0, target: 1, done: false };
    },
    ...extra,
  };
}

describe('the catalogue', () => {
  it('is big: plenty to earn and to buy', () => {
    expect(LOOKS.length).toBeGreaterThanOrEqual(130);
    const by = (k: string) => LOOKS.filter((l) => l.unlock.by === k).length;
    expect(by('achievement')).toBeGreaterThanOrEqual(40); // to earn
    expect(by('credits') + by('cores') + by('vault')).toBeGreaterThanOrEqual(50); // to buy
  });

  it('has every slot, each starting with something free to wear', () => {
    expect(SLOTS).toEqual(SLOT_ORDER);
    for (const slot of SLOTS) {
      expect(SLOT_NAMES[slot], slot).toBeTruthy();
      const items = itemsIn(slot);
      expect(items.length, slot).toBeGreaterThan(1);
      expect(items[0].unlock.by, slot).toBe('free');
    }
  });

  it('has unique ids and names within each slot', () => {
    for (const slot of SLOTS) {
      const items = itemsIn(slot);
      expect(new Set(items.map((i) => i.id)).size, `${slot} ids`).toBe(items.length);
      expect(new Set(items.map((i) => i.name)).size, `${slot} names`).toBe(items.length);
    }
  });

  it('gives every paint and engine colour real colours, except the defaults', () => {
    for (const l of LOOKS) {
      if (l.slot !== 'paint' && l.slot !== 'engine') continue;
      if (l.id === 'standard') expect(l.colors, keyOf(l)).toBeUndefined();
      else for (const c of l.colors ?? ['']) expect(c, keyOf(l)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('only asks for things that exist', () => {
    for (const l of LOOKS) {
      const u = l.unlock;
      const at = keyOf(l);
      if (u.by === 'credits' || u.by === 'cores' || u.by === 'vault') {
        expect(Number.isInteger(u.cost) && u.cost > 0, at).toBe(true);
        // The shop's deal rounds to these, so prices that aren't multiples would look odd.
        expect(u.cost % (u.by === 'credits' ? 50 : 5), at).toBe(0);
      }
      if (u.by === 'rank') expect(u.rank > 0 && u.rank < RANKS.length, at).toBe(true);
      if (u.by === 'league') expect(u.league > 0 && u.league < LEAGUES.length, at).toBe(true);
      if (u.by === 'stars') expect(u.stars > 0 && u.stars <= COURSES.length * 3 + 30, at).toBe(true);
      if (u.by === 'achievement') expect(achievement(u.id), at).toBeDefined();
    }
  });

  it('keeps every old id (saves from before the catalogue grew still work)', () => {
    const old = [
      'hull:dart', 'hull:wing', 'hull:needle', 'hull:manta', 'hull:arrow', 'hull:talon', 'hull:nova', 'hull:raptor',
      'paint:standard', 'paint:slate', 'paint:crimson', 'paint:cobalt', 'paint:olive', 'paint:sand', 'paint:white', 'paint:carbon', 'paint:gunmetal', 'paint:chrome',
      'paint:silver', 'paint:gold', 'paint:platinum', 'paint:diamond', 'paint:champion', 'paint:supernova', 'paint:nebula', 'paint:solar', 'paint:void',
      'paint:aurora', 'paint:frost', 'paint:ember', 'paint:mint', 'paint:rose', 'paint:midnight', 'paint:glacier',
      'markings:none', 'markings:stripe', 'markings:twin', 'markings:split', 'markings:chevron', 'markings:twotone',
      'fins:none', 'fins:tail', 'fins:twin', 'fins:winglets',
      'engine:standard', 'engine:amber', 'engine:cyan', 'engine:violet', 'engine:green', 'engine:white', 'engine:red', 'engine:plasma', 'engine:solar', 'engine:ice', 'engine:gold',
      'decal:none', 'decal:rank', 'decal:league',
    ];
    for (const k of old) expect(byKey(k), k).toBeDefined();
  });

  it('prices old paid items the same', () => {
    const cost = (k: string) => (byKey(k)?.unlock as { cost?: number }).cost;
    expect(cost('hull:arrow')).toBe(1500);
    expect(cost('hull:talon')).toBe(4000);
    expect(cost('hull:nova')).toBe(400);
    expect(cost('paint:nebula')).toBe(120);
    expect(cost('engine:plasma')).toBe(60);
  });
});

describe('goals', () => {
  it('have unique ids, real targets and a name and text', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(40);
    for (const a of ACHIEVEMENTS) {
      expect(a.target, a.id).toBeGreaterThan(0);
      expect(a.name.length, a.id).toBeGreaterThan(2);
      expect(a.text.length, a.id).toBeGreaterThan(4);
      expect(GROUP_NAMES[a.group], a.id).toBeDefined();
    }
  });

  it('start at nothing (a new player has none done) and are all done at the top', () => {
    expect(doneIn(BLANK).size).toBe(0);
    expect(doneIn(MAXED).size).toBe(ACHIEVEMENTS.length);
    for (const p of evaluate(BLANK).values()) expect(p.have).toBeLessThanOrEqual(p.target);
  });

  it('only ever move forward as the numbers grow', () => {
    const steps = [0.1, 0.5, 1, 5, 50];
    for (const a of ACHIEVEMENTS) {
      let last = -1;
      for (const k of steps) {
        const snap: Snapshot = { ...BLANK, runs: k * 100, distance: k * 10000, seconds: k * 5000, nearMisses: k * 1000, bestChain: k * 5, pickups: k * 500, crashes: k * 100, furthest: 1 + k * 5, endlessBest: k * 10000, coursesDone: Math.floor(k), stars: k * 10, upgradePoints: k * 5, looksOwned: k * 20, envBest: { 'open-ground': k * 3000 } };
        const have = progressOn(a, snap).have;
        expect(have, `${a.id} at ${k}`).toBeGreaterThanOrEqual(last);
        last = have;
      }
    }
  });

  it('each give something to earn: a look, and credits', () => {
    for (const a of ACHIEVEMENTS) {
      expect(rewardKeys(a.id).length, `${a.id} unlocks a look`).toBeGreaterThanOrEqual(1);
      expect(a.credits, `${a.id} pays credits`).toBeGreaterThan(0);
    }
  });

  it('are measured from numbers the game really has (ids for environments exist)', () => {
    for (const e of ENVIRONMENTS) {
      const hit = ACHIEVEMENTS.some((a) => a.group === 'places' && a.id.startsWith('env-') && progressOn(a, { ...BLANK, envBest: { [e.id]: 1e9 } }).done);
      expect(hit, `a goal for ${e.id}`).toBe(true);
    }
  });

  it('are reachable: the biggest are inside what the game allows', () => {
    // Nothing asks for more upgrade points than exist, or more set levels than there are.
    expect(Math.max(...ACHIEVEMENTS.filter((a) => a.id.startsWith('upgrades-')).map((a) => a.target))).toBeLessThanOrEqual(30);
    expect(Math.max(...ACHIEVEMENTS.filter((a) => a.id.startsWith('courses-')).map((a) => a.target))).toBeLessThanOrEqual(COURSES.length);
    expect(Math.max(...ACHIEVEMENTS.filter((a) => a.id.startsWith('looks-')).map((a) => a.target))).toBeLessThan(LOOKS.length);
  });
});

describe('sets and the vault', () => {
  it('every set is real looks that can all be bought', () => {
    expect(SETS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(SETS.map((s) => s.id)).size).toBe(SETS.length);
    for (const s of SETS) {
      expect(s.items.length, s.id).toBeGreaterThanOrEqual(4);
      for (const k of s.items) {
        const item = byKey(k);
        expect(item, `${s.id}: ${k}`).toBeDefined();
        expect(item && (item.unlock.by === 'credits' || item.unlock.by === 'cores'), `${s.id}: ${k} can be bought`).toBe(true);
      }
      expect(new Set(s.items).size, s.id).toBe(s.items.length);
      expect(s.bonusCores).toBeGreaterThan(0);
    }
  });

  it('the vault is exactly the looks that only it sells', () => {
    const inVault = LOOKS.filter((l) => l.unlock.by === 'vault').map(keyOf);
    expect([...VAULT_ORDER].sort()).toEqual(inVault.sort());
    for (const k of VAULT_ORDER) expect(buyable(byKey(k) as LookItem), k).toBe(true);
  });
});

describe('owning looks', () => {
  const looks = new Looks();
  const base = owner(BLANK);

  it('owns the free ones and nothing else to start', () => {
    const owned = LOOKS.filter((l) => looks.owns(l, base));
    expect(owned.every((l) => l.unlock.by === 'free')).toBe(true);
    expect(owned.length).toBeGreaterThanOrEqual(SLOTS.length);
  });

  it('opens each kind of unlock when its condition is met', () => {
    const get = (k: string) => byKey(k) as LookItem;
    expect(looks.owns(get('paint:copper'), { ...base, rank: 9 })).toBe(false);
    expect(looks.owns(get('paint:copper'), { ...base, rank: 10 })).toBe(true);
    expect(looks.owns(get('paint:silver'), { ...base, league: 1 })).toBe(true);
    expect(looks.owns(get('paint:dawn'), { ...base, stars: 4 })).toBe(false);
    expect(looks.owns(get('paint:dawn'), { ...base, stars: 5 })).toBe(true);
    expect(looks.owns(get('hull:wing'), base)).toBe(false);
    expect(looks.owns(get('hull:wing'), owner({ ...BLANK, runs: 5 }))).toBe(true);
    expect(looks.owns(get('trail:line'), owner({ ...BLANK, pickups: 50 }))).toBe(true);
    expect(looks.owns(get('decal:star'), base)).toBe(false);
    expect(looks.owns(get('decal:star'), owner({ ...BLANK, runs: 10 }))).toBe(true);
  });

  it('keeps what is bought, and a vault look once bought stays', () => {
    const l = new Looks();
    const vault = byKey(VAULT_ORDER[0]) as LookItem;
    expect(l.owns(vault, base)).toBe(false);
    l.buy(vault);
    expect(l.owns(vault, base)).toBe(true);
    expect(l.has(keyOf(vault))).toBe(true);
  });

  it('pays a set bonus once, when the set is whole', () => {
    const l = new Looks();
    const s = SETS[0];
    expect(l.completedSets(SETS, base)).toEqual([]);
    for (const k of s.items) l.give(k);
    expect(l.completedSets(SETS, base)).toContain(s.id);
    expect(l.completedSets(SETS, base)).not.toContain(s.id);
  });
});

describe('how an unlock reads', () => {
  it('has words and, for goals, progress', () => {
    for (const l of LOOKS) if (l.unlock.by !== 'free') expect(unlockText(l.unlock), keyOf(l)).not.toBe('');
    const p = unlockProgress({ by: 'achievement', id: 'runs-50' }, owner({ ...BLANK, runs: 20 }));
    expect(p).toEqual({ have: 20, target: 50 });
    expect(unlockProgress({ by: 'stars', stars: 10 }, owner({ ...BLANK, stars: 4 }))).toEqual({ have: 4, target: 10 });
    expect(unlockProgress({ by: 'credits', cost: 100 }, base())).toBeNull();
  });
});

function base(): Owner {
  return owner(BLANK);
}
