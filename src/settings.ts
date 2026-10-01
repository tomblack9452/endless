import { CONFIG } from './config';
import { loadNumber, storage } from './storage';

// Player settings, saved as one JSON value through the storage wrapper.

export interface Settings {
  sound: boolean;
  music: number; // index into LEVELS
  effects: number; // index into LEVELS
  steering: number; // index into STEERING
}

export type SettingKey = keyof Settings;

export const LEVELS = ['off', 'low', 'medium', 'full'];
export const LEVEL_GAIN = [0, 0.4, 0.7, 1];
export const STEERING = ['gentle', 'normal', 'quick'];
/** Finger travel for full steer, as a fraction of screen width. Smaller = quicker. */
export const STEERING_RANGE = [0.19, CONFIG.steering.dragRangeFraction, 0.1];

export const DEFAULT_SETTINGS: Settings = { sound: true, music: 3, effects: 3, steering: 1 };

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
  if (key === 'sound') s.sound = !s.sound;
  else if (key === 'steering') s.steering = (s.steering + 1) % STEERING.length;
  else s[key] = (s[key] + 1) % LEVELS.length;
}

export function label(s: Settings, key: SettingKey): string {
  if (key === 'sound') return s.sound ? 'on' : 'off';
  if (key === 'steering') return STEERING[s.steering];
  return LEVELS[s[key]];
}
