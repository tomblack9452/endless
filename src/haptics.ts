// Vibration feedback. Uses the browser Vibration API (Android; iPhones ignore
// it in the browser). The native app build will swap this for Capacitor's
// Haptics plugin behind the same methods.

const can = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export class Haptics {
  enabled = true;

  private buzz(pattern: number | number[]): void {
    if (this.enabled && can) navigator.vibrate(pattern);
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
