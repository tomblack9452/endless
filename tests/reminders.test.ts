import { describe, expect, it } from 'vitest';
import { planReminders, REMINDER_IDS, remindersAvailable } from '../src/platform/reminders';
import { DEFAULT_SETTINGS, REMINDER_TIMES } from '../src/core/settings';

// Reminders: planned on the phone a week ahead, once a day at most, at the
// player's time on the phone's own clock.

const open = { rankedOpen: true, dailyOpen: true, doneToday: false };
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
    expect(planReminders(at(2026, 9, 15, 9), 18, 0, { ...open, doneToday: true })[0].at.getDate()).toBe(16);
    expect(planReminders(at(2026, 9, 15, 9), 8, 0, open)[0].at.getDate()).toBe(16);
  });

  it('say the new ranked run on a Monday, and the daily challenge on the other days', () => {
    const list = planReminders(at(2026, 9, 15, 9), 18, 0, open);
    const monday = list.find((r) => r.at.getDay() === 1)!;
    expect(monday.body).toMatch(/new ranked run/);
    for (const r of list.filter((x) => x !== monday)) expect(r.body).toBe("today's challenge is up");
    // Before ranked and the daily challenge open: the daily reward.
    const early = planReminders(at(2026, 9, 15, 9), 18, 0, { rankedOpen: false, dailyOpen: false, doneToday: false });
    expect(early.every((r) => r.body === 'your daily reward is ready')).toBe(true);
    for (const r of [...list, ...early]) expect(r.title).toBe('endless space');
  });

  it('only exist in the Android app', () => {
    expect(remindersAvailable()).toBe(false);
  });
});
