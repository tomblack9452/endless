// Vibration feedback. Uses the browser Vibration API (Android; iPhones ignore
// it in the browser), at the strength the settings pick.

const can = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** A pattern at a strength (settings: 0 off, 1 light, 2 full): light keeps the rhythm with shorter, softer pulses. */
export function scaled(pattern: number | number[], level: number): number[] {
  const p = typeof pattern === 'number' ? [pattern] : pattern;
  if (level <= 0) return [];
  if (level >= 2) return p;
  // Even entries buzz, odd ones are the gaps between.
  return p.map((ms, i) => (i % 2 === 0 ? Math.max(4, Math.round(ms * 0.4)) : ms));
}

export class Haptics {
  /** Strength: 0 off, 1 light, 2 full (the vibration setting). */
  strength = 2;

  private buzz(pattern: number | number[]): void {
    const p = scaled(pattern, this.strength);
    // Browsers refuse (and log) a buzz before the first tap, like the login reward's at launch.
    if (p.length > 0 && can && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate(p);
  }

  nearMiss(): void {
    this.buzz(8);
  }

  pickup(): void {
    this.buzz([6, 40, 6]);
  }

  boost(): void {
    this.buzz(18);
  }

  level(themeChange: boolean): void {
    this.buzz(themeChange ? [20, 60, 20, 60, 30] : [12, 50, 12]);
  }

  crash(): void {
    this.buzz([45, 30, 70]);
  }

  fall(): void {
    this.buzz([20, 80, 20, 80, 90]);
  }
}
