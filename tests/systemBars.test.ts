import { describe, expect, it } from 'vitest';
import { barStyles, isLight } from '../src/systemBars';

// The status and gesture bars' icons follow what's behind them, not the phone's theme.

describe('system bar styles', () => {
  it('tells light text from dark', () => {
    expect(isLight('#2b2824')).toBe(false);
    expect(isLight('#ebe9e3')).toBe(true);
    expect(isLight('#fff')).toBe(true);
    expect(isLight('nonsense')).toBe(false);
  });

  it('dark icons over a light sky, in light mode, everywhere', () => {
    for (const screen of [null, 'title', 'shop', 'settings'] as const) expect(barStyles(screen, false, '#2b2824')).toEqual({ status: 'light', nav: 'light' });
  });

  it('light icons over a night sky', () => {
    expect(barStyles(null, false, '#ebe9e3')).toEqual({ status: 'dark', nav: 'dark' });
  });

  it('dark mode: light icons over a dark panel, dark ones where the light scene shows', () => {
    expect(barStyles('settings', true, '#2b2824')).toEqual({ status: 'dark', nav: 'dark' });
    // The title and the showrooms have the scene up top and a panel at the foot.
    expect(barStyles('title', true, '#2b2824')).toEqual({ status: 'light', nav: 'dark' });
    expect(barStyles('shop', true, '#2b2824')).toEqual({ status: 'light', nav: 'dark' });
    // A run shows the scene top to bottom.
    expect(barStyles(null, true, '#2b2824')).toEqual({ status: 'light', nav: 'light' });
  });
});
