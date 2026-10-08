import { Capacitor } from '@capacitor/core';
import { CONFIG } from '../config';

// Ads, behind one interface like the store. Rewarded ads are the free way to a
// little convenience (a revive, doubled run credits, a daily gift, a new daily
// goal); premium players get the same rewards without the ad. Interstitials are
// off at launch (CONFIG.ads.interstitial). On the web, and in the apps without
// ad unit ids, there are no ads at all, so rewarded offers aren't shown.
//
// The AdMob version asks for consent first (Google's form, for the UK and EU)
// and for Apple's tracking permission; if either is declined, ads are
// non-personalised. A rewarded ad is loaded ahead of time (after consent, and
// again after each one), so tapping an offer usually shows one at once.

export type RewardedPlacement = 'revive' | 'doubleCredits' | 'dailyGift' | 'rerollQuest';
export type AdResult = 'rewarded' | 'skipped' | 'unavailable';
/** What a tap on an offer came to: 'busy' when an ad is already on its way. */
export type WatchResult = AdResult | 'busy';

/** An ad network: AdMob in the apps, nothing on the web. */
export interface AdNetwork {
  readonly available: boolean;
  start(): Promise<void>;
  /** Load a rewarded ad ahead of time; true once one is ready to show. */
  loadRewarded(): Promise<boolean>;
  /** Show the loaded rewarded ad, settling when it's closed ('skipped' if closed early). */
  rewarded(placement: RewardedPlacement): Promise<AdResult>;
  interstitial(): Promise<void>;
  /** Show the consent form again (settings > ad privacy choices). */
  privacyChoices(): Promise<void>;
  /** Google's consent rules ask for a way back to the form where the player is (the EU and UK). */
  readonly privacyRequired: boolean;
}

class NoAds implements AdNetwork {
  readonly available = false;
  readonly privacyRequired = false;
  async start(): Promise<void> {}
  async loadRewarded(): Promise<boolean> {
    return false;
  }
  async rewarded(): Promise<AdResult> {
    return 'unavailable';
  }
  async interstitial(): Promise<void> {}
  async privacyChoices(): Promise<void> {}
}

type AdMobModule = typeof import('@capacitor-community/admob');

class AdMobAds implements AdNetwork {
  readonly available = true;
  private m: AdMobModule | null = null;
  private npa = true; // non-personalised until consent says otherwise
  privacyRequired = false;

  constructor(private readonly ids: { rewarded: string; interstitial: string }) {}

  async start(): Promise<void> {
    try {
      this.m = await import('@capacitor-community/admob');
      const { AdMob, AdmobConsentStatus } = this.m;
      await AdMob.initialize();
      // Apple's tracking prompt (iOS only; resolves at once elsewhere).
      const tracking = await AdMob.trackingAuthorizationStatus();
      if (tracking.status === 'notDetermined') await AdMob.requestTrackingAuthorization();
      const allowed = (await AdMob.trackingAuthorizationStatus()).status === 'authorized' || Capacitor.getPlatform() !== 'ios';
      // Google's consent form, where the law asks for it.
      let consent = await AdMob.requestConsentInfo();
      if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) consent = await AdMob.showConsentForm();
      this.npa = !(allowed && (consent.status === AdmobConsentStatus.OBTAINED || consent.status === AdmobConsentStatus.NOT_REQUIRED));
      this.privacyRequired = String(consent.privacyOptionsRequirementStatus) === 'REQUIRED';
    } catch {
      this.m = null;
    }
  }

  async loadRewarded(): Promise<boolean> {
    if (!this.m || !this.ids.rewarded) return false;
    try {
      await this.m.AdMob.prepareRewardVideoAd({ adId: this.ids.rewarded, npa: this.npa });
      return true;
    } catch {
      return false;
    }
  }

  async rewarded(): Promise<AdResult> {
    if (!this.m || !this.ids.rewarded) return 'unavailable';
    const { AdMob, RewardAdPluginEvents: E } = this.m;
    // showRewardVideoAd only settles on a reward, so the ad's own events say
    // when it's closed (early or not) or couldn't show.
    return new Promise<AdResult>((resolve) => {
      let earned = false;
      let done = false;
      const handles: Promise<{ remove: () => Promise<void> }>[] = [];
      const finish = (r: AdResult): void => {
        if (done) return;
        done = true;
        for (const h of handles) void h.then((x) => x.remove()).catch(() => {});
        resolve(r);
      };
      try {
        handles.push(AdMob.addListener(E.Rewarded, () => void (earned = true)));
        // The reward can arrive just after the close (some ad networks): a moment's grace before calling it skipped.
        handles.push(AdMob.addListener(E.Dismissed, () => (earned ? finish('rewarded') : void setTimeout(() => finish(earned ? 'rewarded' : 'skipped'), 600))));
        handles.push(AdMob.addListener(E.FailedToShow, () => finish('unavailable')));
        void Promise.all(handles)
          .then(() => AdMob.showRewardVideoAd())
          .then(
            (reward) => void (earned ||= !!reward && reward.amount > 0),
            () => finish('unavailable'),
          );
      } catch {
        finish('unavailable');
      }
    });
  }

  async interstitial(): Promise<void> {
    if (!this.m || !this.ids.interstitial) return;
    try {
      await this.m.AdMob.prepareInterstitial({ adId: this.ids.interstitial, npa: this.npa });
      await this.m.AdMob.showInterstitial();
    } catch {
      // No ad to show: carry on.
    }
  }

  async privacyChoices(): Promise<void> {
    try {
      await this.m?.AdMob.showPrivacyOptionsForm();
    } catch {
      // Not needed where the player is.
    }
  }
}

/**
 * Google's own test ad units: they always fill and never pay, so tapping them
 * is safe. Every build uses these unless VITE_ADMOB_LIVE=1 is set for the
 * release build (tapping your own live ads can get an AdMob account closed).
 */
const TEST_UNITS = {
  android: { rewarded: 'ca-app-pub-3940256099942544/5224354917', interstitial: 'ca-app-pub-3940256099942544/1033173712' },
  ios: { rewarded: 'ca-app-pub-3940256099942544/1712485313', interstitial: 'ca-app-pub-3940256099942544/4411468910' },
};

/** The ad units to use: the real ones only in a live build. */
export function adUnits(platform: 'ios' | 'android', env: Record<string, string | undefined>): { rewarded: string; interstitial: string } {
  if (env.VITE_ADMOB_LIVE !== '1') return TEST_UNITS[platform];
  const ios = platform === 'ios';
  return {
    rewarded: (ios ? env.VITE_ADMOB_REWARDED_IOS : env.VITE_ADMOB_REWARDED_ANDROID) ?? '',
    interstitial: (ios ? env.VITE_ADMOB_INTERSTITIAL_IOS : env.VITE_ADMOB_INTERSTITIAL_ANDROID) ?? '',
  };
}

export function createAdNetwork(): AdNetwork {
  if (!Capacitor.isNativePlatform()) return new NoAds();
  const units = adUnits(Capacitor.getPlatform() === 'ios' ? 'ios' : 'android', import.meta.env as Record<string, string | undefined>);
  return units.rewarded || units.interstitial ? new AdMobAds(units) : new NoAds();
}

/** Settles as `fallback` if `p` hasn't settled within `ms`. */
function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => resolve(v),
      () => resolve(fallback),
    ).finally(() => clearTimeout(t));
  });
}

/** How long a tap waits for an ad to load, and the waits between failed loads. */
export const AD_TIMING = { tapWaitMs: 8_000, loadGiveUpMs: 30_000, retryMs: [5_000, 15_000, 60_000] };

/**
 * The rules, whatever the network: what can be offered, premium's free rewards,
 * the ad kept loaded ahead of time, and the interstitial caps. Pure enough to test.
 */
export class Ads {
  private runsSinceInterstitial = 0;
  private lastInterstitial = 0;
  private started = false;
  private ready = false;
  private loading: Promise<boolean> | null = null;
  private failures = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private watching = false;

  constructor(
    private readonly network: AdNetwork,
    private readonly premium: () => boolean,
    /** When the game was first played (ms), for "not before day N". */
    private readonly firstPlayed: () => number,
  ) {}

  /** Can this reward be offered (an ad to watch, or free for premium)? Swapping a goal is free where there are no ads. */
  offers(p: RewardedPlacement): boolean {
    return CONFIG.ads.rewarded[p] && (this.premium() || this.network.available || p === 'rerollQuest');
  }

  /** What the offer's button says. */
  label(): string {
    return this.premium() ? 'free with premium' : this.network.available ? 'watch an ad' : 'free';
  }

  /** Earn the reward: premium (or no ad network) at once, everyone else by watching to the end. */
  async reward(p: RewardedPlacement): Promise<boolean> {
    return (await this.watch(p)) === 'rewarded';
  }

  /**
   * Like reward, but says why not: 'unavailable' (no ad loaded in time),
   * 'skipped' (closed early) or 'busy' (one is already on its way).
   */
  async watch(p: RewardedPlacement): Promise<WatchResult> {
    if (!this.offers(p)) return 'unavailable';
    if (this.premium() || !this.network.available) return 'rewarded';
    if (this.watching) return 'busy';
    this.watching = true;
    try {
      if (!this.ready) {
        this.preload();
        if (!this.loading || !(await within(this.loading, AD_TIMING.tapWaitMs, false)) || !this.ready) return 'unavailable';
      }
      this.ready = false;
      const r = await this.network.rewarded(p).catch((): AdResult => 'unavailable');
      this.preload(); // the next one, after each shown, closed or failed
      return r;
    } finally {
      this.watching = false;
    }
  }

  /** Whether rewards here come from watching an ad (not premium, not the web). */
  get showsAds(): boolean {
    return this.network.available && !this.premium();
  }

  /** Whether an ad is loaded and waiting. */
  get adReady(): boolean {
    return this.ready;
  }

  /**
   * Load a rewarded ad in the background, unless one is ready or loading.
   * Never before consent (start), and never for premium. A failed load tries
   * again after a wait (5 s, 15 s, then every minute).
   */
  preload(): void {
    if (!this.started || !this.network.available || this.premium() || this.ready || this.loading) return;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    const p = within(this.network.loadRewarded(), AD_TIMING.loadGiveUpMs, false);
    this.loading = p;
    void p.then((ok) => {
      if (this.loading === p) this.loading = null;
      this.ready = ok;
      if (ok) this.failures = 0;
      else this.retryLater();
    });
  }

  private retryLater(): void {
    if (this.premium() || this.retry) return;
    const waits = AD_TIMING.retryMs;
    const wait = waits[Math.min(this.failures, waits.length - 1)];
    this.failures++;
    this.retry = setTimeout(() => {
      this.retry = null;
      this.preload();
    }, wait);
  }
  /** Whether an interstitial would show now after a run (and counts the run). */
  afterRun(now: number, newBest: boolean): boolean {
    const I = CONFIG.ads.interstitial;
    this.runsSinceInterstitial++;
    if (!I.enabled || this.premium() || !this.network.available || newBest) return false;
    if (now - this.firstPlayed() < I.afterDays * 86_400_000) return false;
    if (this.runsSinceInterstitial < I.everyRuns || now - this.lastInterstitial < I.minSeconds * 1000) return false;
    this.runsSinceInterstitial = 0;
    this.lastInterstitial = now;
    void this.network.interstitial();
    return true;
  }

  /** Start the network (consent first), then load the first rewarded ad. */
  async start(): Promise<void> {
    await this.network.start();
    this.started = true;
    this.preload();
  }

  privacyChoices(): Promise<void> {
    return this.network.privacyChoices();
  }

  get hasNetwork(): boolean {
    return this.network.available;
  }

  /** Settings shows "ad privacy choices" when this is true. */
  get privacyRequired(): boolean {
    return this.network.privacyRequired;
  }
}
