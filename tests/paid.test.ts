import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Ads, type AdNetwork, type AdResult } from '../src/ads/ads';
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
  shown = 0;
  interstitials = 0;
  constructor(
    readonly available: boolean,
    private readonly result: AdResult = 'rewarded',
  ) {}
  async start(): Promise<void> {}
  async rewarded(): Promise<AdResult> {
    this.shown++;
    return this.result;
  }
  async interstitial(): Promise<void> {
    this.interstitials++;
  }
  async privacyChoices(): Promise<void> {}
}

const DAY = 86_400_000;

describe('ads', () => {
  it('offer nothing without a network, unless premium (free rewards)', async () => {
    const free = new Ads(new FakeNetwork(false), () => false, () => 0);
    expect(free.offers('revive')).toBe(false);
    expect(await free.reward('revive')).toBe(false);
    const premium = new Ads(new FakeNetwork(false), () => true, () => 0);
    expect(premium.offers('revive')).toBe(true);
    expect(await premium.reward('revive')).toBe(true);
  });

  it('reward only an ad watched to the end, and never show one to premium', async () => {
    const net = new FakeNetwork(true);
    expect(await new Ads(net, () => false, () => 0).reward('doubleCredits')).toBe(true);
    expect(await new Ads(new FakeNetwork(true, 'skipped'), () => false, () => 0).reward('doubleCredits')).toBe(false);
    const premiumNet = new FakeNetwork(true);
    expect(await new Ads(premiumNet, () => true, () => 0).reward('doubleCredits')).toBe(true);
    expect(premiumNet.shown).toBe(0);
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
