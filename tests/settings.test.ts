import { afterEach, describe, expect, it, vi } from 'vitest';
import { cycle, DEFAULT_SETTINGS, label, loadSettings, migrateSettings } from '../src/core/settings';
import { storage } from '../src/core/storage';
import { scaled } from '../src/platform/haptics';
import { itemColour, SAFE, SAFE_SHAPES, setSafeColours } from '../src/world/itemColours';
import { CONFIG } from '../src/core/config';

// Settings are one saved JSON value. A save from an older version has fewer
// settings (or older kinds of them): it gets the defaults for what's new.

afterEach(() => {
  vi.restoreAllMocks();
  setSafeColours(false);
});

/** Settings as 1.0.7 saved them: vibration on/off, no comfort or reminder settings. */
const SAVED_107 = {
  sound: true,
  music: 2,
  effects: 1,
  tilt: false,
  tiltSensitivity: 1,
  steering: 2,
  touch: 0,
  boostSide: 1,
  doubleTapBoost: true,
  haptics: false,
  reduceMotion: true,
  textSize: 1,
  contrast: false,
  assist: false,
  ghost: true,
  performance: false,
  dark: true,
  confirmExit: true,
  quickRetry: true,
};

describe('settings from an older save', () => {
  it('keep every choice made, and take the defaults for the new ones', () => {
    const s = migrateSettings(structuredClone(SAVED_107));
    expect(s).toMatchObject({ music: 2, effects: 1, tilt: false, boostSide: 1, reduceMotion: true, dark: true, quickRetry: true });
    expect(s).toMatchObject({ leftHanded: false, colourBlind: false, reminders: false, reminderTime: DEFAULT_SETTINGS.reminderTime });
    expect(Object.keys(s).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('carry vibration on/off over as full strength or off', () => {
    expect(migrateSettings({ ...SAVED_107, haptics: true }).haptics).toBe(2);
    expect(migrateSettings({ ...SAVED_107, haptics: false }).haptics).toBe(0);
    expect(label(migrateSettings({ haptics: true }), 'haptics')).toBe('full');
    expect(DEFAULT_SETTINGS.haptics).toBe(2);
  });

  it('take the default for anything of the wrong kind or out of range', () => {
    const s = migrateSettings({ music: 9, effects: -1, textSize: 1.5, leftHanded: 'yes', colourBlind: 1, reminderTime: 99, haptics: 'full' });
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
  });

  it('load through storage, and survive a corrupt value', async () => {
    vi.spyOn(storage, 'get').mockResolvedValueOnce(JSON.stringify(SAVED_107));
    const s = await loadSettings();
    expect(s.haptics).toBe(0);
    expect(s.colourBlind).toBe(false);
    vi.spyOn(storage, 'get').mockResolvedValueOnce('{not json');
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('comfort settings', () => {
  it('cycle as their rows are tapped', () => {
    const s = { ...DEFAULT_SETTINGS };
    expect(label(s, 'haptics')).toBe('full');
    cycle(s, 'haptics');
    expect(label(s, 'haptics')).toBe('off');
    cycle(s, 'haptics');
    expect(label(s, 'haptics')).toBe('light');
    expect(label(s, 'music')).toBe('full');
    expect(label(s, 'effects')).toBe('full'); // music and effects have a level each
    cycle(s, 'leftHanded');
    cycle(s, 'colourBlind');
    expect([s.leftHanded, s.colourBlind]).toEqual([true, true]);
    expect(label(s, 'reminderTime')).toBe('18:00');
  });

  it('vibrate lightly with shorter pulses in the same rhythm, or not at all', () => {
    expect(scaled([45, 30, 70], 2)).toEqual([45, 30, 70]);
    expect(scaled([45, 30, 70], 1)).toEqual([18, 30, 28]);
    expect(scaled(8, 1)).toEqual([4]);
    expect(scaled([45, 30, 70], 0)).toEqual([]);
  });

  it('colour-blind mode swaps to blue and orange, and gives each power-up its own shape', () => {
    expect(itemColour('pickup')).toBe(CONFIG.boost.pickup.color);
    setSafeColours(true);
    expect(itemColour('pickup')).toBe(SAFE.pickup);
    expect(itemColour('shield')).toBe(SAFE.shield);
    // Every power-up shape differs from the others.
    expect(new Set(SAFE_SHAPES.map((s) => s.join())).size).toBe(SAFE_SHAPES.length);
    // Helpful things are blue or white; danger is orange.
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 0.1) return -1; // grey or white
      const h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
      return (h * 60 + 360) % 360;
    };
    for (const c of [SAFE.pickup, SAFE.shield, SAFE.magnet, SAFE.slow]) expect(hue(c) === -1 || (hue(c) > 190 && hue(c) < 230), c).toBe(true);
    for (const c of [SAFE.hazard, SAFE.mark]) expect(hue(c) > 20 && hue(c) < 40, c).toBe(true);
  });
});
