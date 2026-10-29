import { CONFIG } from './config';
import { loadNumber, storage } from './storage';

// Player settings, saved as one JSON value through the storage wrapper.
// Every setting is either on/off or an index into a list of named options;
// tapping its row in the settings screen cycles to the next value.

export interface Settings {
  sound: boolean;
  music: number; // LEVELS
  effects: number; // LEVELS
  tilt: boolean;
  tiltSensitivity: number; // TILT
  steering: number; // STEERING (drag range)
  touch: number; // TOUCH: drag anywhere, or hold the left/right side
  boostSide: number; // SIDES: where along the bottom the boost button sits
  doubleTapBoost: boolean; // double-tap and hold anywhere to boost
  haptics: number; // HAPTICS: vibration strength (older saves had on/off)
  reduceMotion: boolean;
  textSize: number; // TEXT
  contrast: boolean; // high-contrast obstacles
  assist: boolean; // slower, with the safe line marked; scores don't count as bests
  ghost: boolean; // ranked: fly against your week's best
  graphics: number; // GRAPHICS: auto (high, dropping to low once if frames run slow), high, or low for older phones
  dark: boolean; // menus on dark panels with light text
  confirmExit: boolean; // Android: back on the title screen asks before closing the app
  quickRetry: boolean; // after a crash (not ranked), one tap flies again, with no game-over screen
  leftHanded: boolean; // the boost button and the HUD's corners mirrored for the left thumb
  colourBlind: boolean; // hazards, pickups and power-ups in a blue and orange palette, with shapes to tell them apart
  reminders: boolean; // a local notification once a day at most (the Android app; off until the player turns it on)
  reminderTime: number; // REMINDER_TIMES: when, on the phone's own clock
  crashMoment: boolean; // a second of slow motion on what you hit, before the game-over screen (not ranked)
  rivalGhost: boolean; // ranked: also race the ghost of the pilot just above you (off until turned on)
}

export type SettingKey = keyof Settings;

const LEVELS = ['off', 'low', 'medium', 'full'];
export const LEVEL_GAIN = [0, 0.4, 0.7, 1];
const STEERING = ['gentle', 'normal', 'quick'];
/** Finger travel for full steer, as a fraction of screen width. Smaller = quicker. */
export const STEERING_RANGE = [0.19, CONFIG.steering.dragRangeFraction, 0.1];
const TILT = ['low', 'medium', 'high'];
export const TILT_GAIN = [0.7, 1, 1.4];
const TOUCH = ['drag', 'tap sides'];
// Saved as an index, so the order stays: 0 right, 1 left, 2 middle.
const SIDES = ['right', 'left', 'middle'];
const TEXT = ['normal', 'large', 'larger'];
export const TEXT_SCALE = [1, 1.2, 1.4];
const HAPTICS = ['off', 'light', 'full'];
// Saved as an index, so the order stays: 0 auto, 1 high, 2 low.
export const GRAPHICS = ['auto', 'high', 'low'];
/** Reminder times to pick from, [hour, minute] on the phone's clock; 18:00 by default. */
export const REMINDER_TIMES: readonly [number, number][] = [
  [8, 0],
  [12, 0],
  [17, 0],
  [18, 0],
  [19, 0],
  [20, 0],
  [21, 0],
];
const REMINDER_LABELS = REMINDER_TIMES.map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);

/** Option lists for the numbered settings (booleans show on/off). */
const OPTIONS: Partial<Record<SettingKey, string[]>> = {
  music: LEVELS,
  effects: LEVELS,
  tiltSensitivity: TILT,
  steering: STEERING,
  touch: TOUCH,
  boostSide: SIDES,
  textSize: TEXT,
  haptics: HAPTICS,
  reminderTime: REMINDER_LABELS,
  graphics: GRAPHICS,
};

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: 3,
  effects: 3,
  tilt: true,
  tiltSensitivity: 1,
  steering: 1,
  touch: 0,
  boostSide: 0,
  doubleTapBoost: true,
  haptics: 2,
  reduceMotion: false,
  textSize: 0,
  contrast: false,
  assist: false,
  ghost: true,
  graphics: 0,
  dark: false,
  confirmExit: true,
  quickRetry: false,
  leftHanded: false,
  colourBlind: false,
  reminders: false,
  reminderTime: 3,
  crashMoment: true,
  rivalGhost: false,
};

const KEY = 'endless.settings';

/**
 * Settings as saved, brought up to date: anything missing (a setting newer
 * than the save) or of the wrong kind takes its default, and older forms are
 * carried over (vibration was on/off: on is full strength now; performance mode on is low graphics).
 */
export function migrateSettings(saved: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (!saved || typeof saved !== 'object') return s;
  const o = saved as Record<string, unknown>;
  if (typeof o.haptics === 'boolean') o.haptics = o.haptics ? 2 : 0;
  // 1.0.9 and older had performance mode on/off: on is low graphics, off is auto.
  if (typeof o.performance === 'boolean' && o.graphics === undefined) o.graphics = o.performance ? 2 : 0;
  for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
    const v = o[key];
    const def = DEFAULT_SETTINGS[key];
    if (typeof v !== typeof def) continue;
    if (typeof v === 'number' && (!Number.isInteger(v) || v < 0 || v >= (OPTIONS[key]?.length ?? 1))) continue;
    (s as Record<SettingKey, unknown>)[key] = v;
  }
  return s;
}

export async function loadSettings(): Promise<Settings> {
  let s = { ...DEFAULT_SETTINGS };
  const raw = await storage.get(KEY);
  if (raw) {
    try {
      s = migrateSettings(JSON.parse(raw));
    } catch {
      // Corrupt value: keep defaults.
    }
  } else {
    // Carry over the older sound on/off setting.
    s.sound = (await loadNumber(CONFIG.storageKeys.sound, 1)) !== 0;
  }
  return s;
}

export function saveSettings(s: Settings): Promise<void> {
  return storage.set(KEY, JSON.stringify(s));
}

/** Next value for a setting when its row is tapped. */
export function cycle(s: Settings, key: SettingKey): void {
  const v = s[key];
  if (typeof v === 'boolean') (s[key] as boolean) = !v;
  else (s[key] as number) = (v + 1) % (OPTIONS[key]?.length ?? 1);
}

/** Settings that are a level (off to full): shown as a meter beside the word. */
export function levelOf(s: Settings, key: SettingKey): { on: number; of: number } | null {
  if (key !== 'music' && key !== 'effects' && key !== 'haptics') return null;
  return { on: s[key], of: (OPTIONS[key]?.length ?? 1) - 1 };
}

export function label(s: Settings, key: SettingKey): string {
  const v = s[key];
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  return OPTIONS[key]?.[v] ?? String(v);
}
