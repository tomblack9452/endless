import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../src/core/config';
import { dayKey } from '../src/economy/time';
import { Challenge, nextStreak, streakReward } from '../src/progression/challenge';
import { SupabaseBackend } from '../src/server/supabase';
import { BOARD_TABS, boardCaption, boardForRun, boardName, boardQuery } from '../src/server/boards';
import { dailyRun } from '../src/world/courses';

// The daily challenge: the course is the day's seed (tests/courses.test.ts flies
// them), the streak counts days in a row by the trusted clock, and the board is
// per day.

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 15, 12); // midday on a Thursday

afterEach(() => vi.unstubAllGlobals());

describe('the day seed', () => {
  it('follows the UTC day: the same course until midnight, a new one straight after', () => {
    const last = Date.UTC(2026, 9, 15, 23, 59, 59, 999);
    expect(dailyRun(dayKey(last)).course.seed).toBe(dailyRun(dayKey(Date.UTC(2026, 9, 15, 0, 0, 0))).course.seed);
    expect(dailyRun(dayKey(last + 1)).course.seed).not.toBe(dailyRun(dayKey(last)).course.seed);
    expect(dayKey(last + 1)).toBe('2026-10-16');
  });

  it("is the server's day, not the phone's", async () => {
    // The phone has been moved two days on; the server says it's still the 15th.
    vi.useFakeTimers({ now: T0 + 2 * DAY, toFake: ['Date'] });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(new Date(T0).toISOString()), { status: 200 })));
    const b = new SupabaseBackend('https://x.supabase.co', 'k');
    expect(dayKey(b.now())).toBe('2026-10-17');
    await b.syncClock();
    expect(dayKey(b.now())).toBe('2026-10-15');
    expect(dailyRun(dayKey(b.now())).id).toBe('daily-2026-10-15');
    vi.useRealTimers();
  });
});

describe('the streak', () => {
  it('grows a day at a time, holds within a day, and starts again after a missed day', () => {
    expect(nextStreak('', 0, '2026-10-15')).toBe(1);
    expect(nextStreak('2026-10-15', 1, '2026-10-15')).toBe(1);
    expect(nextStreak('2026-10-15', 1, '2026-10-16')).toBe(2);
    expect(nextStreak('2026-10-15', 4, '2026-10-17')).toBe(1);
    // Across a month and a year.
    expect(nextStreak('2026-10-31', 2, '2026-11-01')).toBe(3);
    expect(nextStreak('2026-12-31', 6, '2027-01-01')).toBe(7);
  });

  it('pays the ladder once a day, from the first run of each day', () => {
    const c = new Challenge();
    const paid: (number | undefined)[] = [];
    for (let i = 0; i < 9; i++) {
      const day = dayKey(T0 + i * DAY);
      const first = c.record(day, 1000 + i);
      const again = c.record(day, 500);
      expect(again.reward, day).toBeNull();
      expect(again.streak).toBe(i + 1);
      expect(first.reward?.source).toBe(`daily:${day}`);
      paid.push(first.reward?.credits);
    }
    const ladder = CONFIG.daily.streak.map((s) => s.credits);
    expect(paid).toEqual([...ladder, ladder[6], ladder[6]]); // day 7 and on pay the last step
    expect(c.longest).toBe(9);
  });

  it('keeps cores within what earn_cores pays for a day (3)', () => {
    for (let d = 1; d <= 30; d++) expect(streakReward(d).cores ?? 0).toBeLessThanOrEqual(3);
    expect(CONFIG.daily.streak.some((s) => 'cores' in s && s.cores > 0)).toBe(true);
  });

  it('turns over at midnight UTC on the trusted clock, to the millisecond', () => {
    const c = new Challenge();
    const late = Date.UTC(2026, 9, 15, 23, 59, 59, 999);
    expect(c.record(dayKey(late), 2000).streak).toBe(1);
    const next = c.record(dayKey(late + 1), 1500);
    expect(next.streak).toBe(2);
    expect(next.reward).not.toBeNull();
    expect(next.isNew).toBe(true); // a new day: a new best
    expect(c.bestOn('2026-10-16')).toBe(1500);
    expect(c.bestOn('2026-10-15')).toBe(0);
  });

  it('lapses after a missed day, and is shown as 0 until the next run', () => {
    const c = new Challenge();
    c.record('2026-10-15', 100);
    c.record('2026-10-16', 100);
    expect(c.streakOn('2026-10-17')).toBe(2); // still alive tomorrow
    expect(c.streakOn('2026-10-18')).toBe(0); // a day missed
    expect(c.record('2026-10-18', 100).streak).toBe(1);
  });

  it('gives nothing for a day before the last one played (a clock put back)', () => {
    const c = new Challenge();
    c.record('2026-10-16', 900);
    const back = c.record('2026-10-15', 5000);
    expect(back).toMatchObject({ isNew: false, streak: 1, reward: null });
    expect(c.bestOn('2026-10-16')).toBe(900);
  });

  it("doesn't count a crash in the first seconds towards the streak", () => {
    const c = new Challenge();
    c.record('2026-10-15', 100);
    const quick = c.record('2026-10-16', 40, false);
    expect(quick).toMatchObject({ streak: 1, reward: null, isNew: true });
    expect(c.playedOn('2026-10-16')).toBe(false);
    expect(c.record('2026-10-16', 900).reward?.credits).toBe(CONFIG.daily.streak[1].credits);
  });

  it("keeps today's best and tries", () => {
    const c = new Challenge();
    expect(c.record('2026-10-15', 1200).isNew).toBe(true);
    expect(c.record('2026-10-15', 800).isNew).toBe(false);
    expect(c.record('2026-10-15', 1900.7)).toMatchObject({ isNew: true, best: 1900 });
    expect(c.tries).toBe(3);
    expect(c.playedOn('2026-10-15')).toBe(true);
    expect(c.playedOn('2026-10-16')).toBe(false);
  });
});

describe('the daily board', () => {
  it('is a tab of its own, for the day, with everyone on it', () => {
    const tab = BOARD_TABS.find((t) => t.board === 'daily')!;
    expect(tab).toBeDefined();
    expect(boardQuery(tab, 3, Date.UTC(2026, 9, 15, 23, 59))).toEqual({ board: 'daily', period: '2026-10-15', league: 0 });
    expect(boardQuery(tab, 3, Date.UTC(2026, 9, 16, 0, 1)).period).toBe('2026-10-16');
    expect(boardCaption(tab, 0)).toMatch(/midnight/);
    expect(boardName('daily')).toBe('daily');
    expect(boardForRun('solo', null, true, true)).toBe('daily');
    expect(boardForRun('solo', null, true)).toBeNull();
  });
});
