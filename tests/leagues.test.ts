import { describe, expect, it } from 'vitest';
import { emblem, LEAGUES, Leagues, lpFor, weekKey } from '../src/leagues';
import { TIER_COST } from '../src/upgrades';

describe('leagues', () => {
  it('has seven brackets that tile 0..30 points with no gaps', () => {
    expect(LEAGUES.length).toBe(7);
    expect(LEAGUES[0].min).toBe(0);
    for (let i = 1; i < LEAGUES.length; i++) {
      expect(LEAGUES[i].min).toBe(LEAGUES[i - 1].max + 1);
      expect(LEAGUES[i].par).toBeGreaterThan(LEAGUES[i - 1].par);
    }
    expect(LEAGUES[6].max).toBe(30);
  });

  it('pays LP around par', () => {
    expect(lpFor(3000, 3000)).toBe(10);
    expect(lpFor(4500, 3000)).toBe(25);
    expect(lpFor(9000, 3000)).toBe(25);
    expect(lpFor(2250, 3000)).toBe(0);
    expect(lpFor(1000, 3000)).toBe(-15);
  });

  it('climbs divisions, drops them, but never drops a league', () => {
    const l = new Leagues();
    for (let i = 0; i < 10; i++) l.record(3000); // +10 each
    expect([l.league, l.division, l.lp]).toEqual([0, 1, 0]);
    l.record(0); // -15: back to division I
    expect([l.league, l.division]).toEqual([0, 0]);
    for (let i = 0; i < 40; i++) l.record(5000);
    expect(l.promotionReady).toBe(true);
    expect(l.lp).toBe(100); // held full until promoted
    expect(l.tryPromote(4)).toBe(0); // not enough points owned
    expect(l.tryPromote(5)).toBe(LEAGUES[1].promotion);
    expect([l.league, l.division, l.lp]).toEqual([1, 0, 0]);
    for (let i = 0; i < 20; i++) l.record(0);
    expect([l.league, l.division, l.lp]).toEqual([1, 0, 0]); // floor of the league
  });

  it('pays the weekly reward for the best division once the week turns', () => {
    const l = new Leagues();
    const mon = new Date(2026, 9, 5, 12).getTime(); // Monday 5 Oct 2026
    l.rollWeek(mon);
    for (let i = 0; i < 10; i++) l.record(3000, mon);
    expect(l.weeklySoFar()).toBe(LEAGUES[0].weekly[1]);
    expect(l.rollWeek(mon + 2 * 86400000)).toBe(0); // same week
    expect(l.rollWeek(mon + 7 * 86400000)).toBe(LEAGUES[0].weekly[1]);
    expect(weekKey(mon + 6 * 86400000)).toBe(weekKey(mon)); // Sunday is the same week
  });

  it('prices a full ship at 246,000 credits', () => {
    const perSystem = TIER_COST.reduce((a, b) => a + b, 0);
    expect(perSystem * 6).toBe(246000);
  });

  it('draws an emblem for every league', () => {
    for (let i = 0; i < LEAGUES.length; i++) expect(emblem(i, 1)).toMatch(/^<svg/);
  });
});
