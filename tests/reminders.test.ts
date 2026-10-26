import { describe, expect, it } from 'vitest';
import { planReminders, REMINDER_IDS, remindersAvailable } from '../src/platform/reminders';
import { DEFAULT_SETTINGS, REMINDER_TIMES } from '../src/core/settings';
import { dayKey } from '../src/economy/time';

// Reminders: planned on the phone a week ahead, once a day at most, at the
// player's time on the phone's own clock.

const open = { rankedOpen: true, dailyOpen: true, doneDay: null };
const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo, d, h, mi).getTime();
const localDay = (t: Date) => `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`;

describe('reminders', () => {
  it('are off until the player turns them on, at 18:00 unless they pick another time', () => {
    expect(DEFAULT_SETTINGS.reminders).toBe(false);
    expect(REMINDER_TIMES[DEFAULT_SETTINGS.reminderTime]).toEqual([18, 0]);
  });

  it('come once a day at most, a week ahead, at the chosen time', () => {
    const list = planReminders(at(2026, 9, 15, 9), 18, 0, open); // a Thursday morning
    expect(list).toHaveLength(7);
    expect(new Set(list.map((r) => localDay(r.at))).size).toBe(7);
    expect(new Set(list.map((r) => r.id)).size).toBe(7);
    for (const r of list) {
      expect(REMINDER_IDS).toContain(r.id);
      expect([r.at.getHours(), r.at.getMinutes()]).toEqual([18, 0]);
    }
  });

  it("leave today out once the time's gone, or today's challenge is flown", () => {
    expect(planReminders(at(2026, 9, 15, 19), 18, 0, open).map((r) => r.at.getDate())).toEqual([16, 17, 18, 19, 20, 21]);
    expect(planReminders(at(2026, 9, 15, 9), 18, 0, { ...open, doneDay: dayKey(at(2026, 9, 15, 9)) })[0].at.getDate()).toBe(16);
    expect(planReminders(at(2026, 9, 15, 9), 8, 0, open)[0].at.getDate()).toBe(16);
  });

  it("follow the game's day for what's done: away from UTC, an evening reminder after midnight UTC still rings (1.0.11)", () => {
    const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env; // Node's
    const tz = env.TZ;
    env.TZ = 'America/Los_Angeles';
    try {
      // 10:00 in Los Angeles on Thursday 15 Oct is 17:00 UTC: today's challenge (the 15th) is flown.
      const now = at(2026, 9, 15, 10);
      expect(dayKey(now)).toBe('2026-10-15');
      // 18:00 there is 01:00 UTC on the 16th: a new challenge, so the reminder stays.
      const list = planReminders(now, 18, 0, { ...open, doneDay: '2026-10-15' });
      expect(list[0].at.getDate()).toBe(15);
      expect(list).toHaveLength(7);
      // An early reminder (08:00 there, 15:00 UTC) on the day that's done is left out.
      expect(planReminders(at(2026, 9, 15, 7), 8, 0, { ...open, doneDay: '2026-10-15' })[0].at.getDate()).toBe(16);
    } finally {
      if (tz === undefined) delete env.TZ;
      else env.TZ = tz;
    }
  });

  it('say the new ranked run on a Monday, and the daily challenge on the other days', () => {
    const list = planReminders(at(2026, 9, 15, 9), 18, 0, open);
    const monday = list.find((r) => r.at.getDay() === 1)!;
    expect(monday.body).toMatch(/new ranked run/);
    for (const r of list.filter((x) => x !== monday)) expect(r.body).toBe("today's challenge is up");
    // Before ranked and the daily challenge open: the daily reward.
    const early = planReminders(at(2026, 9, 15, 9), 18, 0, { rankedOpen: false, dailyOpen: false, doneDay: null });
    expect(early.every((r) => r.body === 'your daily reward is ready')).toBe(true);
    for (const r of [...list, ...early]) expect(r.title).toBe('endless space');
  });

  it('only exist in the Android app', () => {
    expect(remindersAvailable()).toBe(false);
  });
});
