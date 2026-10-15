import { Capacitor } from '@capacitor/core';
import { dayKey } from '../economy/time';
import { reportError } from './errors';

// Reminders (opt-in, the Android app): a local notification at the time the
// player picks (18:00 unless they change it), once a day at most. No push
// server and nothing sent anywhere: the phone schedules them itself.
//
//   which    on a Monday (the UTC week the game keeps) "new ranked run";
//            otherwise "today's challenge is up", or before the daily
//            challenge opens, "your daily reward is ready"
//   when     a week ahead, one a day, planned again each time the game is
//            opened, sent to the background or the setting changes; a player
//            who stops playing hears nothing after that week
//   today    left out once the player has already done today's thing
//   asking   Android 13+ needs the POST_NOTIFICATIONS permission: asked only
//            when reminders are turned on (in settings, or the one gentle
//            offer after the 5th valid run), never at start-up

/** The notification ids the reminders use (one a day for a week). Anything else is left alone. */
export const REMINDER_IDS: readonly number[] = [1080, 1081, 1082, 1083, 1084, 1085, 1086];
const CHANNEL = 'reminders';

/** What the game knows when the reminders are planned. */
export interface ReminderState {
  /** Ranked is open (the Monday reminder says so). */
  rankedOpen: boolean;
  /** The daily challenge is open. */
  dailyOpen: boolean;
  /** Today's thing is done (the daily flown, or with it closed, the daily reward claimed): no reminder today. */
  doneToday: boolean;
}

export interface Reminder {
  id: number;
  at: Date;
  title: string;
  body: string;
}

/**
 * The week's reminders from `now` (the phone's clock: they ring by its time),
 * at `hour`:`minute` local time, one a day at most.
 */
export function planReminders(now: number, hour: number, minute: number, st: ReminderState): Reminder[] {
  const out: Reminder[] = [];
  const today = new Date(now);
  for (let i = 0; i < REMINDER_IDS.length; i++) {
    const at = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i, hour, minute, 0, 0);
    if (at.getTime() <= now + 60_000) continue; // already past (or about to be)
    if (i === 0 && st.doneToday) continue;
    // The game's week turns on Monday, UTC: say so on the day it does.
    const monday = new Date(Date.parse(`${dayKey(at.getTime())}T00:00:00Z`)).getUTCDay() === 1;
    const body =
      monday && st.rankedOpen
        ? "new ranked run: this week's course is up"
        : st.dailyOpen
          ? "today's challenge is up"
          : 'your daily reward is ready';
    out.push({ id: REMINDER_IDS[i], at, title: 'endless space', body });
  }
  return out;
}

/** Can this device show reminders? The Android app only. */
export function remindersAvailable(): boolean {
  return Capacitor.getPlatform() === 'android';
}

async function plugin() {
  return (await import('@capacitor/local-notifications')).LocalNotifications;
}

/** Ask for the permission (Android 13+ shows the system's question; older ones have it already). True if granted. */
export async function askPermission(): Promise<boolean> {
  if (!remindersAvailable()) return false;
  try {
    const n = await plugin();
    const now = await n.checkPermissions();
    if (now.display === 'granted') return true;
    if (now.display === 'denied') return false; // Android won't ask again: settings > apps it is
    return (await n.requestPermissions()).display === 'granted';
  } catch (e) {
    reportError('reminders permission', e);
    return false;
  }
}

/** Cancel every reminder, then schedule these (none: just cancel). Never asks for the permission. */
export async function scheduleReminders(list: readonly Reminder[]): Promise<void> {
  if (!remindersAvailable()) return;
  try {
    const n = await plugin();
    await n.cancel({ notifications: REMINDER_IDS.map((id) => ({ id })) });
    if (list.length === 0) return;
    if ((await n.checkPermissions()).display !== 'granted') return;
    await n.createChannel({ id: CHANNEL, name: 'reminders', description: 'the daily challenge and the new ranked run, once a day at most', importance: 3 });
    await n.schedule({
      notifications: list.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        channelId: CHANNEL,
        // About the time is fine: no exact alarms (the manifest leaves that permission out).
        schedule: { at: r.at, allowWhileIdle: false },
        isExactNotification: false,
      })),
    });
  } catch (e) {
    reportError('reminders schedule', e);
  }
}
