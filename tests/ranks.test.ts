import { describe, expect, it } from 'vitest';
import { creditsFor, insignia, par, rankFor, RANKS, skillDelta, xpFor } from '../src/ranks';

describe('rank ladder', () => {
  it('has 35 ranks from recruit to general grade 4', () => {
    expect(RANKS.length).toBe(35);
    expect(RANKS[0].name).toBe('recruit');
    expect(RANKS[34]).toMatchObject({ name: 'general', grade: 4, xp: 50000, skill: 50 });
  });

  it('only ever asks for more as you climb', () => {
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i].xp).toBeGreaterThan(RANKS[i - 1].xp);
      expect(RANKS[i].skill).toBeGreaterThanOrEqual(RANKS[i - 1].skill);
    }
  });

  it('needs both XP and skill', () => {
    expect(rankFor(0, 1)).toBe(0);
    expect(rankFor(250, 4)).toBe(6); // enough XP for sergeant, not the skill
    expect(rankFor(250, 5)).toBe(7);
    expect(rankFor(1_000_000, 1)).toBe(6); // XP alone stops at corporal g2
    expect(rankFor(50000, 50)).toBe(34);
  });

  it('draws an insignia for every rank', () => {
    for (let i = 0; i < RANKS.length; i++) expect(insignia(i)).toMatch(/^<svg/);
  });
});

describe('xp and skill', () => {
  it('gives nothing for instant crashes, then 1 + 1 per 400 points', () => {
    expect(xpFor(100)).toBe(0);
    expect(xpFor(2000)).toBe(6);
    expect(xpFor(30000)).toBe(76);
  });

  it('takes well over a thousand good runs to reach general grade 4', () => {
    const runs = 50000 / xpFor(12000); // a strong run on a weekly level
    expect(runs).toBeGreaterThan(1300);
    expect(runs).toBeLessThan(2000);
  });

  it('moves skill against par (a share of the week\'s score target)', () => {
    expect(par(1, 10000)).toBe(3500);
    expect(par(50, 10000)).toBe(12000);
    expect(par(10, 20000)).toBe(2 * par(10, 10000));
    expect(skillDelta(par(10), 10)).toBe(1);
    expect(skillDelta(par(10) * 1.5, 10)).toBe(2);
    expect(skillDelta(par(10) * 0.7, 10)).toBe(0);
    expect(skillDelta(par(10) * 0.4, 10)).toBe(-1);
    expect(skillDelta(0, 1)).toBe(0); // never below 1
    expect(skillDelta(1e9, 50)).toBe(0); // never above 50
  });

  it('pays solo half the credits of ranked', () => {
    expect(creditsFor(5000, true)).toBe(50);
    expect(creditsFor(5000, false)).toBe(25);
  });
});
