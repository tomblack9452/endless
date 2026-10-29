import { CONFIG } from '../core/config';
import type { Game } from '../core/game';
import { type Pack, shortOf } from '../economy/nudge';
import { analytics } from '../platform/analytics';
import type { ProductId } from '../store/store';
import { formatScore } from '../ui/ui';

/** The store's packs of one currency, by what each gives. */
function packs(currency: 'credits' | 'cores'): Pack[] {
  const out: Pack[] = [];
  for (const p of CONFIG.economy.store.products) {
    if (currency === 'credits' && 'credits' in p) out.push({ id: p.id, amount: p.credits });
    if (currency === 'cores' && 'cores' in p && 'bonus' in p) out.push({ id: p.id, amount: p.cores });
  }
  return out;
}

/**
 * A tap on something the wallet can't cover: "N credits short", with the ways
 * to make it up. Swap cores (credits only, when there are enough), the
 * smallest pack that covers it, or not now. The player asked (they tapped
 * buy), so it isn't counted against the one unasked prompt a session.
 */
export class ShortOfSheet {
  constructor(private readonly g: Game) {}

  /** `go` buys the thing, once the wallet covers it. */
  show(currency: 'credits' | 'cores', need: number, what: string, go: () => void): void {
    const w = this.g.wallet;
    const have = currency === 'credits' ? w.credits : w.cores;
    const rate = CONFIG.economy.shop.creditsPerCore;
    const s = shortOf(need, have, packs(currency), currency === 'credits' ? { cores: w.cores, creditsPerCore: rate } : undefined);
    if (s.short <= 0) return go();
    const price = s.pack ? this.g.storeProducts.find((p) => p.id === s.pack!.id)?.price : undefined;
    if (s.pack && price) analytics.log('view_item', { item_id: s.pack.id, source: 'short' });
    const swap = s.swap;
    this.g.econ.offer(
      {
        kicker: what,
        name: `${formatScore(s.short)} ${currency} short`,
        lines: [`it's ${formatScore(need)} ${currency}. you have ${formatScore(have)}`],
        yes: s.pack && price ? `${formatScore(s.pack.amount)} ${currency} · ${price}` : 'open the store',
        yesEnabled: true,
        alt: swap ? `swap ${formatScore(swap)} cores` : '',
        altEnabled: swap !== null && w.cores >= (swap ?? 0),
        no: 'not now',
        seconds: 0,
      },
      () => {
        if (s.pack && price) void this.g.purchases.buyProduct(s.pack.id as ProductId);
        else this.g.shop.openStore(null, 'short');
      },
      () => undefined,
      () => {
        if (!swap || !w.spendCores(swap, 'swap')) return;
        this.g.grant({ credits: swap * rate }, 'swap');
        this.g.sound.pickup();
        this.g.title.refreshTitle();
        go();
      },
    );
  }
}
