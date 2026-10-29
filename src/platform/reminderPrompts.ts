import { REMINDER_TIMES, saveSettings } from '../core/settings';
import { askPermission, planReminders, remindersAvailable, scheduleReminders } from './reminders';
import { dayKey } from '../economy/time';
import { storage } from '../core/storage';
import type { Game } from '../core/game';

/** The reminders were offered once (after the 5th valid run): kept on this device only. */
const REMINDERS_OFFERED_KEY = 'endless.remindersOffered';

export class ReminderPrompts {
  constructor(private readonly g: Game) {}

  /** The reminders offer was looked at this session (it's made once, ever). */
  private reminderOfferChecked = false;

  /** Turn reminders on: Android asks for the permission now (and only now). Off again if it's refused. */
  async turnOnReminders(): Promise<void> {
    void storage.set(REMINDERS_OFFERED_KEY, '1'); // never offered after this
    if (!(await askPermission())) {
      this.g.settings.reminders = false;
      this.g.ui.renderSettings(this.g.settings);
      void saveSettings(this.g.settings);
      this.g.ui.showNotice('notifications are off for endless space. turn them on in android settings first');
      return;
    }
    this.g.settings.reminders = true;
    this.g.ui.renderSettings(this.g.settings);
    void saveSettings(this.g.settings);
    const [h, m] = REMINDER_TIMES[this.g.settings.reminderTime];
    this.g.ui.showNotice(`reminders on: ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}, once a day at most`);
    await this.planReminders();
  }

  /** Plan the week's reminders again (or cancel them all, when they're off). */
  async planReminders(): Promise<void> {
    if (!remindersAvailable() || !this.g.economyLoaded || !this.g.settingsLoaded) return;
    if (!this.g.settings.reminders) return scheduleReminders([]);
    const day = dayKey(this.g.now());
    const dailyOpen = this.g.open('daily');
    const [h, m] = REMINDER_TIMES[this.g.settings.reminderTime] ?? REMINDER_TIMES[3];
    await scheduleReminders(
      planReminders(Date.now(), h, m, {
        rankedOpen: this.g.open('ranked'),
        dailyOpen,
        doneDay: (dailyOpen ? this.g.challenge.playedOn(day) : this.g.daily.loginDue(day) < 0) ? day : null,
      }),
    );
  }

  /** Once, gently, after the 5th valid run: would they like a daily reminder? On the title, with nothing else up. */
  async offerReminders(): Promise<void> {
    if (this.reminderOfferChecked || !this.g.settingsLoaded || !remindersAvailable() || this.g.settings.reminders || this.g.progress.stats.validRuns < 5)
      return;
    if (this.g.state !== 'title' || this.g.infoOpen || this.g.settingsOpen || this.g.econ.offerOpen || this.g.ui.celebrating || this.g.exitAsking) return;
    this.reminderOfferChecked = true;
    if ((await storage.get(REMINDERS_OFFERED_KEY)) !== null) return;
    void storage.set(REMINDERS_OFFERED_KEY, '1');
    const [h, m] = REMINDER_TIMES[this.g.settings.reminderTime];
    this.g.econ.offer(
      {
        kicker: '',
        name: 'a daily reminder?',
        lines: [
          `a nudge at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} when there's something new to fly. once a day at most`,
          'settings can change the time or turn it off',
        ],
        yes: 'remind me',
        yesEnabled: true,
        no: 'no thanks',
        seconds: 0,
      },
      () => {
        this.g.settings.reminders = true;
        void this.turnOnReminders();
      },
      () => undefined,
    );
  }
}
