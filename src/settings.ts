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
  haptics: boolean;
  reduceMotion: boolean;
  textSize: number; // TEXT
  contrast: boolean; // high-contrast obstacles
  assist: boolean; // slower, with the safe line marked; scores don't count as bests
  ghost: boolean; // ranked: fly against your week's best
  performance: boolean; // lower resolution and lighter weather, for older phones
  dark: boolean; // menus on dark panels with light text
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

/** Option lists for the numbered settings (booleans show on/off). */
const OPTIONS: Partial<Record<SettingKey, string[]>> = {
  music: LEVELS,
  effects: LEVELS,
  tiltSensitivity: TILT,
  steering: STEERING,
  touch: TOUCH,
  boostSide: SIDES,
  textSize: TEXT,
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
  haptics: true,
  reduceMotion: false,
  textSize: 0,
  contrast: false,
  assist: false,
  ghost: true,
  performance: false,
  dark: false,
};

const KEY = 'endless.settings';

export async function loadSettings(): Promise<Settings> {
  const s = { ...DEFAULT_SETTINGS };
  const raw = await storage.get(KEY);
  if (raw) {
    try {
      Object.assign(s, JSON.parse(raw) as Partial<Settings>);
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

export function label(s: Settings, key: SettingKey): string {
  const v = s[key];
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  return OPTIONS[key]?.[v] ?? String(v);
}
