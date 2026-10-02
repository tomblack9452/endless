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
  boostSide: number; // SIDES: which bottom corner the boost control sits in
  haptics: boolean;
  reduceMotion: boolean;
  textSize: number; // TEXT
  contrast: boolean; // high-contrast obstacles
  assist: boolean; // slower, with the safe line marked; scores don't count as bests
}

export type SettingKey = keyof Settings;

export const LEVELS = ['off', 'low', 'medium', 'full'];
export const LEVEL_GAIN = [0, 0.4, 0.7, 1];
export const STEERING = ['gentle', 'normal', 'quick'];
/** Finger travel for full steer, as a fraction of screen width. Smaller = quicker. */
export const STEERING_RANGE = [0.19, CONFIG.steering.dragRangeFraction, 0.1];
export const TILT = ['low', 'medium', 'high'];
export const TILT_GAIN = [0.7, 1, 1.4];
export const TOUCH = ['drag', 'tap sides'];
export const SIDES = ['right', 'left'];
export const TEXT = ['normal', 'large', 'larger'];
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
  haptics: true,
  reduceMotion: false,
  textSize: 0,
  contrast: false,
  assist: false,
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
