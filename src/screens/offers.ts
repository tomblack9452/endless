import { CONFIG } from '../core/config';
import type { Game } from '../core/game';
import { storage } from '../core/storage';
import { boughtPack, type OfferState, type PackInfo, type Sale, starterLeft, type StoreCardPick, storeCard, weeklyPack } from '../economy/offers';
import { analytics } from '../platform/analytics';
import { weekKey } from '../progression/leagues';
import type { TitleCard } from '../ui/ui';
import { formatScore } from '../ui/ui';
import type { StoreSource } from './shop';

const KEY = 'endless.offers';

function packs(): PackInfo[] {
  const out: PackInfo[] = [];
  for (const p of CONFIG.economy.store.products) {
    if ('credits' in p) out.push({ id: p.id, kind: 'credits', bonus: p.bonus });
    else if ('cores' in p && 'bonus' in p) out.push({ id: p.id, kind: 'cores', bonus: p.bonus });
  }
  return out;
}

function amount(id: string): string {
  const p = CONFIG.economy.store.products.find((x) => x.id === id);
  if (!p) return id;
  if ('credits' in p) return `${formatScore(p.credits)} credits`;
  if ('look' in p) return 'the starter pack';
  if ('cores' in p) return `${formatScore(p.cores)} cores`;
  return 'premium' in p ? 'premium' : 'the season pass';
}

function hoursLeft(ms: number): string {
  const h = Math.ceil(ms / 3_600_000);
  return h > 48 ? `${Math.ceil(h / 24)}d left` : `${h}h left`;
}

/**
 * The store's offers outside the store (docs/game.md): the starter offer that
 * runs out, the title's store card, first purchase doubled, and the sales the
 * server says are running.
 */
export class Offers {
  private s: OfferState = {};
  sales: Sale[] = [];
  private shown = new Set<string>();

  constructor(private readonly g: Game) {}

  async load(): Promise<void> {
    try {
      this.s = JSON.parse((await storage.get(KEY)) ?? '{}') as OfferState;
    } catch {
      this.s = {};
    }
  }

  private save(): void {
    void storage.set(KEY, JSON.stringify(this.s));
  }

  /** Purchases can happen here (the app, with the store answering). */
  private get canBuy(): boolean {
    return this.g.store.available && this.g.storeProducts.length > 0;
  }

  /** From the server's purchase records: has this account ever bought a pack? */
  notePurchases(products: readonly string[]): void {
    if (this.s.packBought || !boughtPack(products)) return;
    this.s.packBought = true;
    this.save();
  }

  markPackBought(): void {
    if (this.s.packBought) return;
    this.s.packBought = true;
    this.save();
  }

  /** The first time a hangar slot with premium looks opens: point at trying them on. */
  tryOnHint(slot: string, hasPremium: boolean): void {
    if (!hasPremium || this.s.tryOn?.includes(slot)) return;
    this.s.tryOn = [...(this.s.tryOn ?? []), slot];
    this.save();
    this.g.ui.showNotice('tap a look to try it on: premium ones glow');
  }

  /** The next pack of cores or credits pays double (the server doubles it: 0028_store_offers.sql). */
  get firstDouble(): boolean {
    return this.canBuy && !this.s.packBought;
  }

  saleOn(id: string): Sale | null {
    return this.sales.find((s) => s.product === id) ?? null;
  }

  /** The starter offer's time left, starting its 48 hours the first time it's asked for while on. */
  private starter(now: number): number | null {
    const left = starterLeft(this.s, now, this.g.progress.stats.validRuns, this.g.purchases.ownsProduct('starter_pack'));
    if (left !== null && this.s.starterAt === undefined) {
      this.s.starterAt = now;
      this.save();
    }
    return left;
  }

  private pick(now: number): StoreCardPick | null {
    const live = this.sales.filter((s) => s.endsAt > now);
    return storeCard({
      canBuy: this.canBuy,
      runs: this.g.progress.stats.validRuns,
      sale: live[0] ?? null,
      starterLeft: this.canBuy ? this.starter(now) : null,
      passWaiting: this.g.pass.premium ? 0 : this.g.pass.tier,
      week: weeklyPack(weekKey(now), packs()),
    });
  }

  /** The title's store card, or null. */
  card(now: number): TitleCard | null {
    const p = this.pick(now);
    if (!p) return null;
    const id = p.kind === 'sale' ? `sale:${p.sale.product}` : p.kind === 'pack' ? `week:${p.pack.id}` : p.kind;
    if (!this.shown.has(id)) {
      this.shown.add(id);
      analytics.log('offer_shown', { offer: id });
    }
    if (p.kind === 'sale')
      return {
        id: 'store-card',
        kicker: p.sale.label,
        title: amount(p.sale.product),
        sub: `ends in ${hoursLeft(p.sale.endsAt - now).replace(' left', '')}`,
        hot: true,
      };
    if (p.kind === 'starter') return { id: 'store-card', kicker: "pilot's starter pack", title: 'best value', sub: hoursLeft(p.left), hot: true };
    if (p.kind === 'pass') return { id: 'store-card', kicker: 'season pass', title: `${p.waiting} premium reward${p.waiting === 1 ? '' : 's'} waiting` };
    return { id: 'store-card', kicker: 'this week', title: amount(p.pack.id), sub: p.pack.bonus > 0 ? 'best value' : '' };
  }

  /** The store card tapped: the store, at what it showed. */
  open(): void {
    const p = this.pick(this.g.now());
    if (!p) return;
    const target = p.kind === 'sale' ? p.sale.product : p.kind === 'starter' ? 'starter_pack' : p.kind === 'pack' ? p.pack.id : null;
    const source: StoreSource = p.kind === 'sale' ? 'sale' : p.kind === 'starter' ? 'starter_offer' : p.kind === 'pass' ? 'pass_card' : 'week_pack';
    analytics.log('offer_tapped', { offer: source });
    if (p.kind === 'pass') return this.g.shop.openPass(null);
    this.g.shop.openStore(null, source);
    if (target) requestAnimationFrame(() => document.querySelector(`[data-act="${target}"]`)?.closest('.store-card')?.scrollIntoView({ block: 'center' }));
  }
}
