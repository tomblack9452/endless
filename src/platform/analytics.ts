import { Capacitor } from '@capacitor/core';

// Usage stats through Firebase Analytics (docs/analytics.md). Nothing is sent
// unless all of these hold: it's the Android app, the build has Firebase set
// up (VITE_ANALYTICS=1, with google-services.json in android/app), the player
// has agreed on Google's consent form (the one the ads use), and "share usage
// stats" is on in settings. No names or emails are ever sent.

export type AdPlacement = 'revive' | 'double_credits' | 'daily_gift' | 'goal_swap';
export type Currency = 'credits' | 'cores';

/** Every event the game logs, with its parameters (Firebase's names: snake_case, 40 characters at most). */
export interface Events {
  run_start: { mode: string };
  run_end: { mode: string; score: number; distance: number; seconds: number; level: number; outcome: 'crashed' | 'finished' | 'quit' };
  tutorial_complete: { controls: string };
  tutorial_skip: { step: string };
  sign_up: { method: 'anonymous' | 'google' };
  login: { method: 'google' };
  ad_offer_shown: { placement: AdPlacement };
  ad_offer_tapped: { placement: AdPlacement };
  ad_rewarded: { placement: AdPlacement };
  ad_skipped: { placement: AdPlacement };
  ad_unavailable: { placement: AdPlacement };
  view_store: { source: string };
  view_item: { item_id: string; source: string };
  begin_checkout: { item_id: string };
  /** No value: Firebase already counts the money from Google Play (in_app_purchase), so a value here would count it twice. */
  purchase: { item_id: string };
  purchase_cancelled: { item_id: string };
  spend_virtual_currency: { virtual_currency_name: Currency; value: number; item_name: string };
  earn_virtual_currency: { virtual_currency_name: Currency; value: number; source: string };
}

/** The slice of the Firebase plugin the game uses. */
export interface AnalyticsPlugin {
  setEnabled(o: { enabled: boolean }): Promise<void>;
  logEvent(o: { name: string; params?: Record<string, string | number> }): Promise<void>;
  setCurrentScreen(o: { screenName: string; screenClassOverride?: string }): Promise<void>;
}

export class Analytics {
  private consent = false;
  /** Whether the consent form has answered yet: until then events wait here, in memory only. */
  private asked = false;
  private waiting: { name: string; params: Record<string, string | number> }[] = [];
  private setting = true;
  private on = false;
  private plugin: AnalyticsPlugin | null = null;

  /** `load` brings the plugin in; null for a build that can't send anything. */
  constructor(private readonly load: (() => Promise<AnalyticsPlugin>) | null) {}

  /** The consent form's answer (agreed, or not asked where the law doesn't need it). */
  setConsent(agreed: boolean): Promise<void> {
    this.consent = agreed;
    this.asked = true;
    return this.update();
  }

  /** The "share usage stats" setting. */
  setSetting(on: boolean): Promise<void> {
    this.setting = on;
    return this.update();
  }

  /** Whether this build can send anything at all (settings shows the switch only then). */
  get available(): boolean {
    return this.load !== null;
  }

  get enabled(): boolean {
    return this.on;
  }

  private async update(): Promise<void> {
    const want = this.load !== null && this.consent && this.setting;
    if (!want && (this.asked || !this.setting)) this.waiting = [];
    if (want === this.on) return;
    this.on = want;
    try {
      if (want && !this.plugin && this.load) this.plugin = await this.load();
      await this.plugin?.setEnabled({ enabled: want });
    } catch {
      this.on = false; // no Firebase on this device after all: stay quiet
    }
    const waiting = this.waiting;
    this.waiting = [];
    if (this.on) for (const e of waiting) this.send(e.name, e.params);
  }

  private send(name: string, params: Record<string, string | number>): void {
    void this.plugin?.logEvent({ name, params }).catch(() => undefined);
  }

  log<K extends keyof Events>(name: K, params: Events[K]): void {
    const p = params as unknown as Record<string, string | number>;
    if (this.on) this.send(name, p);
    else if (!this.asked && this.load && this.setting && this.waiting.length < 20) this.waiting.push({ name, params: p });
  }

  screen(name: string): void {
    if (!this.on || !this.plugin) return;
    void this.plugin.setCurrentScreen({ screenName: name, screenClassOverride: name }).catch(() => undefined);
  }
}

const configured = Capacitor.getPlatform() === 'android' && import.meta.env.VITE_ANALYTICS === '1';

export const analytics = new Analytics(
  configured ? () => import('@capacitor-firebase/analytics').then((m) => m.FirebaseAnalytics as unknown as AnalyticsPlugin) : null,
);
