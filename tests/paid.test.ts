import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AD_TIMING, Ads, adUnits, type AdNetwork, type AdResult } from '../src/ads/ads';
import { LOOKS } from '../src/catalogue';
import { CONFIG } from '../src/config';
import { Looks, type Owner } from '../src/looks';
import { entitlementFor, Entitlements } from '../src/store/entitlements';

// Paid features: what premium owns, and the rules around ads.

const data = new Map<string, string>();
beforeEach(() => {
  data.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
});
afterEach(() => delete (globalThis as { localStorage?: unknown }).localStorage);

describe('entitlements', () => {
  it('map one-time products, and nothing else', () => {
    expect(entitlementFor('premium')).toBe('premium');
    expect(entitlementFor('starter_pack')).toBe('starter');
    expect(entitlementFor('cores_100')).toBeNull();
    expect(entitlementFor('season_pass')).toBeNull();
  });

  it('can be taken back (a refund), and stay gone after a reload', async () => {
    const e = new Entitlements();
    await e.load();
    e.grant('premium');
    e.revoke('premium');
    expect(e.has('premium')).toBe(false);
    expect(entitlementFor('refunded:premium')).toBeNull();
    const again = new Entitlements();
    await again.load();
    expect(again.has('premium')).toBe(false);
  });

  it('are kept, and older saves\' bought products carry over', async () => {
    data.set('endless.purchases', JSON.stringify(['starter_pack']));
    const e = new Entitlements();
    await e.load();
    expect(e.has('starter')).toBe(true);
    expect(e.has('premium')).toBe(false);
    expect(e.grant('premium')).toBe(true);
    expect(e.grant('premium')).toBe(false);
    const again = new Entitlements();
    await again.load();
    expect(again.has('premium')).toBe(true);
  });

  it('premium is a store product, and its looks need it', () => {
    expect(CONFIG.economy.store.products.some((p) => p.id === 'premium')).toBe(true);
    const looks = LOOKS.filter((l) => l.unlock.by === 'premium');
    expect(looks.map((l) => l.slot).sort()).toEqual(['hull', 'paint', 'trail']);
    const owner = (premium: boolean): Owner => ({ rank: 0, stars: 0, league: 0, premium, goal: () => ({ have: 0, target: 1, done: false }) });
    const l = new Looks();
    for (const item of looks) {
      expect(l.owns(item, owner(false))).toBe(false);
      expect(l.owns(item, owner(true))).toBe(true);
    }
  });
});

class FakeNetwork implements AdNetwork {
  privacyRequired = false;
  shown = 0;
  loads = 0;
  interstitials = 0;
  /** What the next loads do: fill, fail, or never answer. */
  fill: 'ok' | 'fail' | 'hang' = 'ok';
  constructor(
    readonly available: boolean,
    public result: AdResult = 'rewarded',
  ) {}
  async start(): Promise<void> {}
  loadRewarded(): Promise<boolean> {
    this.loads++;
    if (this.fill === 'hang') return new Promise(() => {});
    return Promise.resolve(this.fill === 'ok');
  }
  async rewarded(): Promise<AdResult> {
    this.shown++;
    return this.result;
  }
  async interstitial(): Promise<void> {
    this.interstitials++;
  }
  async privacyChoices(): Promise<void> {}
}

/** Ads on a started network (consent done). */
async function started(net: FakeNetwork, premium = false): Promise<Ads> {
  const ads = new Ads(net, () => premium, () => 0);
  await ads.start();
  await Promise.resolve();
  return ads;
}

const DAY = 86_400_000;

describe('ad units', () => {
  it("are Google's test units unless the build is marked live", () => {
    const env = { VITE_ADMOB_REWARDED_ANDROID: 'ca-app-pub-real/1' };
    expect(adUnits('android', env).rewarded).toBe('ca-app-pub-3940256099942544/5224354917');
    expect(adUnits('android', { ...env, VITE_ADMOB_LIVE: '1' }).rewarded).toBe('ca-app-pub-real/1');
    expect(adUnits('ios', {}).rewarded).toMatch(/^ca-app-pub-3940256099942544\//);
  });
});

describe('ads', () => {
  it('offer nothing without a network, unless premium (free rewards)', async () => {
    const free = new Ads(new FakeNetwork(false), () => false, () => 0);
    expect(free.offers('revive')).toBe(false);
    expect(await free.reward('revive')).toBe(false);
    const premium = new Ads(new FakeNetwork(false), () => true, () => 0);
    expect(premium.offers('revive')).toBe(true);
    expect(await premium.reward('revive')).toBe(true);
  });

  it('swap a daily goal for free where there are no ads (the web)', async () => {
    const web = new Ads(new FakeNetwork(false), () => false, () => 0);
    expect(web.offers('rerollQuest')).toBe(true);
    expect(web.label()).toBe('free');
    expect(await web.reward('rerollQuest')).toBe(true);
    expect(new Ads(new FakeNetwork(true), () => false, () => 0).label()).toBe('watch an ad');
  });

  it('reward only an ad watched to the end, and never show one to premium', async () => {
    const net = new FakeNetwork(true);
    expect(await (await started(net)).reward('doubleCredits')).toBe(true);
    expect(await (await started(new FakeNetwork(true, 'skipped'))).reward('doubleCredits')).toBe(false);
    const premiumNet = new FakeNetwork(true);
    expect(await (await started(premiumNet, true)).reward('doubleCredits')).toBe(true);
    expect(premiumNet.shown).toBe(0);
    expect(premiumNet.loads).toBe(0); // nothing loaded for premium either
  });

  it('load one ad ahead after consent, and another after each is shown', async () => {
    const net = new FakeNetwork(true);
    const ads = new Ads(net, () => false, () => 0);
    ads.preload();
    expect(net.loads).toBe(0); // not before consent
    await ads.start();
    await Promise.resolve();
    expect(net.loads).toBe(1);
    expect(ads.adReady).toBe(true);
    ads.preload();
    expect(net.loads).toBe(1); // one is enough
    expect(await ads.watch('revive')).toBe('rewarded');
    expect(net.loads).toBe(2);
    net.result = 'skipped';
    await Promise.resolve();
    expect(await ads.watch('dailyGift')).toBe('skipped'); // closed early: no reward
    expect(net.loads).toBe(3);
    expect(net.shown).toBe(2);
  });

  it("say so when no ad loads in time, and don't stall", async () => {
    vi.useFakeTimers();
    try {
      const net = new FakeNetwork(true);
      net.fill = 'hang';
      const ads = new Ads(net, () => false, () => 0);
      await ads.start();
      const tap = ads.watch('revive');
      expect(await ads.watch('revive')).toBe('busy'); // a second tap waits for the first
      await vi.advanceTimersByTimeAsync(AD_TIMING.tapWaitMs);
      expect(await tap).toBe('unavailable');
      expect(net.shown).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retry a failed load with backoff, and stop for premium', async () => {
    vi.useFakeTimers();
    try {
      let premium = false;
      const net = new FakeNetwork(true);
      net.fill = 'fail';
      const ads = new Ads(net, () => premium, () => 0);
      await ads.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(net.loads).toBe(1);
      await vi.advanceTimersByTimeAsync(AD_TIMING.retryMs[0]);
      expect(net.loads).toBe(2);
      await vi.advanceTimersByTimeAsync(AD_TIMING.retryMs[1] - 1);
      expect(net.loads).toBe(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(net.loads).toBe(3);
      // A tap while it's failing: a clear no, and the offer can be tried again.
      expect(await ads.watch('doubleCredits')).toBe('unavailable');
      expect(net.loads).toBe(4);
      net.fill = 'ok';
      expect(await ads.watch('doubleCredits')).toBe('rewarded');
      net.fill = 'fail';
      premium = true;
      const before = net.loads;
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(net.loads).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keep interstitials off at launch', () => {
    expect(CONFIG.ads.interstitial.enabled).toBe(false);
    const net = new FakeNetwork(true);
    const ads = new Ads(net, () => false, () => 0);
    for (let i = 0; i < 20; i++) ads.afterRun(30 * DAY + i * 600_000, false);
    expect(net.interstitials).toBe(0);
  });

  it('cap interstitials when on: not early, not often, not after a best, not for premium', () => {
    const I = CONFIG.ads.interstitial as { enabled: boolean; minSeconds: number };
    const was = I.enabled;
    I.enabled = true;
    try {
      const net = new FakeNetwork(true);
      const ads = new Ads(net, () => false, () => 0);
      for (let i = 0; i < 10; i++) ads.afterRun(DAY + i * 600_000, false); // before day 3
      expect(net.interstitials).toBe(0);
      const t = 10 * DAY;
      expect(ads.afterRun(t, false)).toBe(true); // ten runs since: one shows
      expect(ads.afterRun(t + 1000, false)).toBe(false);
      expect(ads.afterRun(t + 2000, false)).toBe(false);
      expect(ads.afterRun(t + 3000, false)).toBe(false); // three runs, but too soon
      expect(ads.afterRun(t + I.minSeconds * 1000 + 1, true)).toBe(false); // a new best
      expect(ads.afterRun(t + I.minSeconds * 1000 + 2, false)).toBe(true);
      const premiumNet = new FakeNetwork(true);
      const premium = new Ads(premiumNet, () => true, () => 0);
      for (let i = 0; i < 10; i++) premium.afterRun(t + i * 600_000, false);
      expect(premiumNet.interstitials).toBe(0);
    } finally {
      I.enabled = was;
    }
  });
});
