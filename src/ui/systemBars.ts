import { Capacitor, SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core';
import type { ScreenName } from './ui';

// Android draws the game edge to edge, so the status bar and the gesture bar sit
// over it. Their icons follow what's behind them, not the phone's own dark mode:
// light icons over a night sky or a dark-mode panel, dark ones over a light sky.

/** Screens whose panel reaches the top of the screen. The title and the showrooms have the scene there. */
const PANEL_TOP: ReadonlySet<ScreenName> = new Set(['settings', 'goals', 'record', 'solo', 'league', 'store', 'pass', 'boards', 'name', 'paused', 'over']);

export type BarStyle = 'light' | 'dark'; // 'dark': light icons, for a dark background

/** True for a light colour (#rgb or #rrggbb): the scene's text is light over a dark sky. */
export function isLight(hex: string): boolean {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return false;
  const lin = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const y = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return y > 0.18; // about mid-grey to the eye
}

/** The bars' styles for what's on screen: the open screen (null in a run), dark mode, and the scene's text colour. */
export function barStyles(screen: ScreenName | null, dark: boolean, text: string): { status: BarStyle; nav: BarStyle } {
  const night = isLight(text); // light text means a dark sky behind it
  return {
    status: night || (dark && screen !== null && PANEL_TOP.has(screen)) ? 'dark' : 'light',
    // Every menu's foot is a panel; in a run the scene is behind the gesture bar.
    nav: night || (dark && screen !== null) ? 'dark' : 'light',
  };
}

/** Sets the bars on Android, only when a style actually changes. */
export class Bars {
  private shown = { status: '', nav: '' };
  private readonly native = Capacitor.getPlatform() === 'android';

  sync(screen: ScreenName | null, dark: boolean, text: string): void {
    if (!this.native) return;
    const want = barStyles(screen, dark, text);
    const set = (bar: SystemBarType, style: BarStyle): void => {
      void SystemBars.setStyle({ bar, style: style === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
    };
    if (want.status !== this.shown.status) set(SystemBarType.StatusBar, want.status);
    if (want.nav !== this.shown.nav) set(SystemBarType.NavigationBar, want.nav);
    this.shown = want;
  }
}
