import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { creditsFor, insignia, rankFor, Ranked, RANKS, xpFor } from '../src/ranks';

describe('rank ladder', () => {
  it('has 35 ranks from recruit to general grade 4', () => {
    expect(RANKS.length).toBe(35);
    expect(RANKS[0].name).toBe('recruit');
    expect(RANKS[34]).toMatchObject({ name: 'general', grade: 4, xp: 50000 });
  });

  it('only ever asks for more as you climb', () => {
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i].xp).toBeGreaterThan(RANKS[i - 1].xp);
  });

  it('is reached on XP alone', () => {
    expect(rankFor(0)).toBe(0);
    expect(rankFor(249)).toBe(6);
    expect(rankFor(250)).toBe(7);
    expect(rankFor(50000)).toBe(34);
    expect(rankFor(1e9)).toBe(34);
  });

  it('draws an insignia for every rank', () => {
    for (let i = 0; i < RANKS.length; i++) expect(insignia(i)).toMatch(/^<svg/);
  });
});

describe('xp', () => {
  it('gives nothing for instant crashes, and ranked pays the most', () => {
    expect(xpFor(100, true)).toBe(0);
    expect(xpFor(2000, true)).toBe(1 + Math.floor(2000 / CONFIG.rank.rankedPointsPerXp));
    expect(xpFor(8000, true)).toBeGreaterThan(xpFor(8000, false));
    expect(xpFor(8000, false)).toBeGreaterThan(0);
  });

  it('comes from every mode, doubled for the day\'s first three runs', () => {
    const r = new Ranked();
    const day = Date.UTC(2026, 9, 5, 12);
    const xp = xpFor(6000, false);
    for (let i = 0; i < 3; i++) expect(r.record('solo', 6000, 5, 1, day).xp).toBe(2 * xp);
    expect(r.record('endless', 6000, 5, 1, day).xp).toBe(xp);
    expect(r.history.length).toBe(0); // only ranked runs are kept in the history
    r.record('ranked', 6000, 5, 1, day, '2026-10-05');
    expect(r.history.length).toBe(1);
  });

  it('pays promotions when goals add XP', () => {
    const r = new Ranked();
    const p = r.addXp(RANKS[3].xp);
    expect(p).toMatchObject({ rankBefore: 0, rankAfter: 3 });
    expect(p.credits).toBeGreaterThan(0);
  });

  it('pays ranked more credits per point than solo', () => {
    expect(creditsFor(5000, true)).toBeGreaterThan(creditsFor(5000, false));
  });
});
