import { dayKey } from '../economy/time';
import { type Buyable, type RunNudge, runNudge } from '../economy/nudge';
import { byKey } from '../ship/looks';
import { MAX_TIER, SYSTEMS, TIER_COST } from '../ship/upgrades';
import { formatScore } from '../ui/ui';
import type { Game } from '../core/game';

/** The end screen's one line about spending: what this run's credits now buy, or what's just out of reach. */
export class ResultsScreen {
  constructor(private readonly g: Game) {}

  private shown: RunNudge = null;

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
    const n = this.shown;
    if (!n) return;
    this.g.nav.toMainMenu();
    if (n.kind === 'close') this.g.shop.openStore(null, 'results');
    else if (n.item.where === 'hangar') this.g.hangarScreen.openHangar({ upgrades: true });
    else this.g.nav.onTitleLink('shop');
  }
}
