import { beforeEach, describe, expect, it } from 'vitest';
import { migrateMissionLooks, migrateTickets } from '../src/legacy';
import { byKey, Looks, type Owner } from '../src/looks';

// Missions are gone. A save that had unlocked hulls and flames with them keeps
// those looks, and the hull and flame it was wearing.

const data = new Map<string, string>();
beforeEach(() => {
  data.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
});

const nobody: Owner = { rank: 0, stars: 0, league: 0, goal: () => ({ have: 0, target: 1, done: false }) };
const owns = (l: Looks, key: string): boolean => l.owns(byKey(key)!, nobody);

describe('missions carried over', () => {
  it('a new save gets nothing', async () => {
    const l = new Looks();
    await migrateMissionLooks(l);
    expect(owns(l, 'hull:wing')).toBe(false);
    expect(owns(l, 'trail:line')).toBe(false);
  });

  it('keeps the first n mission unlocks, and what was worn', async () => {
    data.set('endless.cosmetics', JSON.stringify({ unlocked: 5, ship: 'needle', trail: 'line', palette: 'clay' }));
    const l = new Looks();
    await migrateMissionLooks(l);
    for (const k of ['trail:line', 'hull:wing', 'trail:dashes', 'hull:needle', 'engine:aurora']) expect(owns(l, k), k).toBe(true);
    for (const k of ['trail:ion', 'hull:manta', 'paint:signal']) expect(owns(l, k), k).toBe(false);
    expect(l.equipped.hull).toBe('needle');
    expect(l.equipped.trail).toBe('line');
  });

  it('all eleven opens everything the old goals did', async () => {
    data.set('endless.cosmetics', JSON.stringify({ unlocked: 11 }));
    const l = new Looks();
    await migrateMissionLooks(l);
    for (const k of ['hull:manta', 'trail:ion', 'paint:signal']) expect(owns(l, k), k).toBe(true);
  });

  it('a save that arrives later (from the cloud) is still carried over', async () => {
    const l = new Looks();
    await migrateMissionLooks(l);
    data.set('endless.cosmetics', JSON.stringify({ unlocked: 2 }));
    await migrateMissionLooks(l);
    expect(owns(l, 'hull:wing')).toBe(true);
  });

  it('runs once: a later look is not overwritten', async () => {
    data.set('endless.cosmetics', JSON.stringify({ unlocked: 2, ship: 'wing' }));
    const l = new Looks();
    await migrateMissionLooks(l);
    l.equip('hull', 'dart');
    await migrateMissionLooks(l);
    expect(l.equipped.hull).toBe('dart');
  });
});

describe('tickets paid back', () => {
  it('pays 30 cores for each ticket beyond the week, once', async () => {
    data.set('endless.tickets', JSON.stringify({ count: 8, week: '2026-10-05' }));
    let got = 0;
    expect(await migrateTickets((n) => (got += n))).toBe(90);
    expect(await migrateTickets((n) => (got += n))).toBe(0);
    expect(got).toBe(90);
  });

  it('pays nothing for the week\'s own tickets or a new save', async () => {
    expect(await migrateTickets(() => {})).toBe(0);
    data.set('endless.tickets', JSON.stringify({ count: 3 }));
    expect(await migrateTickets(() => {})).toBe(0);
  });
});
