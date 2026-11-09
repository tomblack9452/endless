import { dayKey } from '../economy/time';
import { type Buyable, type RunNudge, runNudge } from '../economy/nudge';
import { vaultAt } from '../economy/shop';
import { analytics } from '../platform/analytics';
import { maybeAskReview } from '../platform/review';
import { byKey, type LookItem } from '../ship/looks';
import { MAX_TIER, SYSTEMS, TIER_COST } from '../ship/upgrades';
import { formatScore } from '../ui/ui';
import type { Game } from '../core/game';

/** The end screen's one line about spending: what this run's credits now buy, or what's just out of reach. */
export class ResultsScreen {
  constructor(private readonly g: Game) {}

  private shown: RunNudge = null;
  /** This month's vault look, offered after a new best. */
  private vault: LookItem | null = null;
  /** The line offers going ad-free (after an interstitial). */
  private noAds = false;

  /** What credits can buy right now: each upgrade's next tier (where the league allows it) and today's looks. */
  private buyables(): Buyable[] {
    const out: Buyable[] = [];
    for (const s of SYSTEMS) {
      const tier = this.g.upgrades.tier(s.id);
      if (tier >= MAX_TIER || !this.g.upgrades.check(s.id, Number.POSITIVE_INFINITY, this.g.leagues.league).ok) continue;
      out.push({ name: `${s.name} ${tier + 1}`, cost: TIER_COST[tier], where: 'hangar' });
    }
    const o = this.g.owner();
    const owned = (key: string): boolean => {
      const it = byKey(key);
      return !!it && this.g.looks.owns(it, o);
    };
    for (const f of this.g.dailyShop.offers(dayKey(this.g.now()), owned)) {
      if (f.currency === 'credits') out.push({ name: f.item.name, cost: f.price, where: 'shop' });
    }
    return out;
  }

  /** After the run's credits are in: fill the line (the "close" one at most once a session, as it's a store prompt). */
  afterRun(earned: number): void {
    // A new best is a proud moment: this month's vault look, to try on (the session's one store prompt).
    const now = this.g.now();
    if (this.g.newBest) void maybeAskReview(true, this.g.progress.stats.validRuns, now);
    const v = vaultAt(now);
    this.vault = null;
    this.noAds = false;
    if (this.g.newBest && this.g.store.available && !this.g.looks.owns(v.item, this.g.owner()) && this.g.storePrompts.take()) {
      this.vault = v.item;
      this.shown = null;
      analytics.log('offer_shown', { offer: 'vault' });
      this.g.ui.setOverNext(`this month's vault: ${v.item.name} · ${formatScore(v.price)} cores · try it on`);
      return;
    }
    // An interstitial played since the last end screen: once, say how to be rid of them.
    if (this.g.adSeen && this.g.store.available && !this.g.ads.adFree && this.g.storePrompts.take()) {
      this.g.adSeen = false;
      this.noAds = true;
      this.shown = null;
      analytics.log('offer_shown', { offer: 'no_ads' });
      this.g.ui.setOverNext("no ads, ever: premium or the pilot's club · see the store");
      return;
    }
    const after = this.g.wallet.credits;
    let n = runNudge(after - earned, after, this.buyables());
    if (n?.kind === 'close' && !this.g.storePrompts.take()) n = null;
    this.shown = n;
    if (!n) this.g.ui.setOverNext(null);
    else if (n.kind === 'afford') this.g.ui.setOverNext(`enough for ${n.item.name} · open ${n.item.where}`);
    else this.g.ui.setOverNext(`${formatScore(n.short)} credits from ${n.item.name} · top up`);
  }

  /** The line tapped: to the hangar or shop it names, or the store to top up. */
  onNext(): void {
    if (this.noAds) {
      analytics.log('offer_tapped', { offer: 'no_ads' });
      this.g.nav.toMainMenu();
      this.g.shop.openStore(null, 'no_ads');
      requestAnimationFrame(() => document.querySelector('[data-act="club"]')?.closest('.store-card')?.scrollIntoView({ block: 'center' }));
      return;
    }
    const v = this.vault;
    if (v) {
      analytics.log('offer_tapped', { offer: 'vault' });
      this.g.nav.toMainMenu();
      this.g.hangarScreen.openHangar({ slot: v.slot });
      this.g.hangarScreen.onHangarPick(v.id);
      return;
    }
    const n = this.shown;
    if (!n) return;
    this.g.nav.toMainMenu();
    if (n.kind === 'close') this.g.shop.openStore(null, 'results');
    else if (n.item.where === 'hangar') this.g.hangarScreen.openHangar({ upgrades: true });
    else this.g.nav.onTitleLink('shop');
  }
}
