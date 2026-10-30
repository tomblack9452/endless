import { describe, expect, it } from 'vitest';
import { type Buyable, runNudge, shortOf, StorePrompts } from '../src/economy/nudge';

const items: Buyable[] = [
  { name: 'thrust 4', cost: 1500, where: 'hangar' },
  { name: 'glacier', cost: 7500, where: 'shop' },
  { name: 'deflector 2', cost: 600, where: 'hangar' },
];

describe('after a run', () => {
  it('names the cheapest thing the run put in reach', () => {
    expect(runNudge(500, 1600, items)).toEqual({ kind: 'afford', item: items[2] });
  });

  it('says what is close when nothing new is in reach', () => {
    expect(runNudge(1000, 1300, items)).toEqual({ kind: 'close', item: items[0], short: 200 });
  });

  it('says nothing when everything is far off or already affordable', () => {
    expect(runNudge(100, 200, items)).toBeNull(); // 600 is 400 short: over 20%
    expect(runNudge(9000, 9100, items)).toBeNull(); // all affordable before the run
  });
});

describe('short of', () => {
  const packs = [
    { id: 'credits_10000', amount: 10000 },
    { id: 'credits_1000', amount: 1000 },
    { id: 'credits_5000', amount: 5000 },
    { id: 'credits_2500', amount: 2500 },
  ];

  it('offers the cores swap when there are enough cores, and the smallest pack that covers it', () => {
    expect(shortOf(1620, 1500, packs, { cores: 10, creditsPerCore: 25 })).toEqual({ short: 120, swap: 5, pack: packs[1] });
    expect(shortOf(4000, 1000, packs).pack).toBe(packs[2]); // 3,000 short: the 5,000 pack, not the 2,500
  });

  it('leaves the swap out without enough cores, and the pack out when none is big enough', () => {
    expect(shortOf(60000, 0, packs, { cores: 3, creditsPerCore: 25 })).toEqual({ short: 60000, swap: null, pack: null });
  });

  it('has no swap for cores themselves', () => {
    expect(shortOf(550, 300, [{ id: 'cores_550', amount: 550 }]).swap).toBeNull();
  });
});

describe('store prompts', () => {
  it('allow one unasked prompt a session', () => {
    const s = new StorePrompts();
    expect(s.take()).toBe(true);
    expect(s.take()).toBe(false);
  });
});
