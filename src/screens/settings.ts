import { CONFIG } from '../core/config';
import { cycle, LEVEL_GAIN, saveSettings, type SettingKey, STEERING_RANGE, TEXT_SCALE, TILT_GAIN } from '../core/settings';
import { SAFE, setSafeColours } from '../world/itemColours';
import { remindersAvailable } from '../platform/reminders';
import { latestNotes, SEEN_KEY, whatsNewOnLaunch } from '../ui/whatsNew';
import { storage } from '../core/storage';
import type { Game } from '../core/game';
import NEW_ICON from '../assets/icons/new.svg?raw';

/** Where the boost button sits, by the boostSide setting (0 right, 1 left, 2 middle). */
const BOOST_SIDES = ['right', 'left', 'middle'] as const;

export class SettingsScreen {
  constructor(private readonly g: Game) {}

  onSetting = (key: SettingKey): void => {
    cycle(this.g.settings, key);
    this.applySettings();
    void saveSettings(this.g.settings);
    if (key === 'reminders' && this.g.settings.reminders) void this.g.reminders.turnOnReminders();
    else if (key === 'reminders' || key === 'reminderTime') void this.g.reminders.planReminders();
  };

  applySettings(): void {
    const s = this.g.settings;
    this.g.sound.setMuted(!s.sound);
    this.g.sound.setLevels(LEVEL_GAIN[s.music], LEVEL_GAIN[s.effects]);
    this.g.input.dragRange = STEERING_RANGE[s.steering];
    this.g.input.tiltEnabled = s.tilt;
    this.g.input.tiltSensitivity = TILT_GAIN[s.tiltSensitivity];
    this.g.input.sidesMode = s.touch === 1;
    this.g.input.doubleTapBoost = s.doubleTapBoost;
    this.g.haptics.strength = s.haptics;
    const low = this.g.lowGraphics();
    this.g.stage.setPerformance(low);
    this.g.weather.lite = low;
    if (!s.ghost) this.g.ghost.stop();
    this.g.world.assist = this.g.assistOn();
    if (this.g.assistOn() && this.g.state !== 'title') this.g.assisted = true;
    this.g.ui.setDisplay(TEXT_SCALE[s.textSize], this.boostSide(), s.reduceMotion, s.leftHanded);
    this.g.showroomSpin.auto = !s.reduceMotion; // the showroom's ship turns only when dragged
    // Colour-blind mode: the safe palette for hazards, pickups and power-ups, and a shape for each power-up.
    setSafeColours(s.colourBlind);
    this.g.world.setColourBlind(s.colourBlind);
    for (const p of [this.g.basePalette, this.g.palette]) p.pickup.set(s.colourBlind ? SAFE.pickup : CONFIG.boost.pickup.color);
    this.g.applyLook(this.g.distanceScore / CONFIG.score.levelLength);
    this.g.ui.setDark(s.dark);
    this.g.title.refreshTitle(); // the rank colour has a light and a dark version
    this.g.ui.renderSettings(s);
  }

  /** Where the boost button sits: the setting, mirrored for the left hand (right and left swap; the middle stays). */
  boostSide(): (typeof BOOST_SIDES)[number] {
    const side = BOOST_SIDES[this.g.settings.boostSide] ?? 'right';
    if (!this.g.settings.leftHanded || side === 'middle') return side;
    return side === 'right' ? 'left' : 'right';
  }

  /** Where "send feedback" was pressed, for the mail: settings (over the title or a paused run), or the pause screen. */
  /** The first launch after an update: a few lines about it (never on a fresh install, never twice). */
  async checkWhatsNew(): Promise<void> {
    const seen = await storage.get(SEEN_KEY);
    if (seen === __APP_VERSION__) return;
    await storage.set(SEEN_KEY, __APP_VERSION__);
    const lines = whatsNewOnLaunch(seen, __APP_VERSION__, !this.g.onboarding.done);
    if (lines) this.showWhatsNew();
  }

  /** The card for this version (settings > help > what's new shows it again). */
  showWhatsNew(): void {
    const notes = latestNotes(__APP_VERSION__);
    if (!notes) return;
    this.g.ui.celebrate([{ kicker: "what's new", icon: NEW_ICON, name: `version ${notes.version}`, lines: [...notes.lines] }]);
  }

  /** What was up when an error happened, for the error log. */
  errorScreen(): string {
    if (this.g.settingsOpen) return 'settings';
    if (this.g.infoOpen) return String(this.g.infoOpen);
    return this.g.state === 'playing' || this.g.state === 'paused' || this.g.state === 'crashed'
      ? `${this.g.state} (${this.g.mode}, level ${this.g.level})`
      : this.g.state;
  }

  feedbackScreen(): string {
    const run = `${this.g.mode} run, level ${this.g.level}`;
    if (this.g.settingsOpen) return this.g.state === 'paused' ? `settings (paused ${run})` : 'settings';
    return this.g.state === 'paused' ? `pause (${run})` : this.g.state;
  }

  openSettings(): void {
    this.g.settingsOpen = true;
    this.g.ui.setNative(this.g.native, remindersAvailable());
    this.g.ui.show('settings');
    this.g.account.refreshAccount();
    void this.g.backend
      .pilotName()
      .then((name) =>
        this.g.ui.setPilotName(name ?? '', this.g.backend.online ? '3 to 16 letters, numbers, spaces, - or _' : 'names come with the server', 'settings'),
      );
  }

  closeSettings(): void {
    this.g.settingsOpen = false;
    this.g.ui.show(this.g.state === 'paused' ? 'paused' : 'title');
  }
}
