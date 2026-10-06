import { SETS, VAULT_ORDER, type LookSet } from '../catalogue';
import { CONFIG } from '../config';
import { byKey, keyOf, LOOKS, type LookItem } from '../looks';
import { seasonAt } from '../season';
import { isSeasonShopLook } from '../seasonLooks';
import { storage } from '../storage';
import { hash, picker } from './time';

// The shop turns over on the clock, the same for everyone (UTC):
//   today    four looks a day; one a deal at a quarter off, at least one premium,
//            and during a season one of that season's generated looks.
//            Looks you don't own come first, and the day's picks are written down
//            the first time you open the shop, so buying one doesn't reshuffle the rest.
//   the set  one themed set a week as a bundle at a discount. Every set comes round
//            once before any repeats.
//   vault    one rare look for a month at a time, then away until its turn comes round.

const DAY = 86_400_000;
const WEEK = 7 * DAY;
/** A Monday: week numbers count from here. */
const EPOCH = Date.parse('2024-01-01T00:00:00Z');

export interface Offer {
  item: LookItem;
  currency: 'credits' | 'cores';
  price: number;
  full: number; // before any deal
  deal: boolean;
}

const DEAL = 0.75;

/** What a look costs in cores' worth, for pricing a bundle that mixes the two currencies. */
export function coresWorth(item: LookItem): number {
  const u = item.unlock;
  if (u.by === 'cores' || u.by === 'vault') return u.cost;
  if (u.by === 'credits') return u.cost / CONFIG.economy.shop.creditsPerCore;
  return 0;
}

function offerFor(item: LookItem, deal: boolean): Offer {
  const u = item.unlock as { by: 'credits' | 'cores'; cost: number };
  const step = u.by === 'cores' ? 5 : 50;
  const price = deal ? Math.round((u.cost * DEAL) / step) * step : u.cost;
  return { item, currency: u.by, price, full: u.cost, deal };
}

/** Looks the daily shop can sell: paid for with credits or cores, not the vault's. */
function dailyPool(): LookItem[] {
  return LOOKS.filter((l) => l.unlock.by === 'credits' || l.unlock.by === 'cores');
}

/**
 * The day's looks, the same for everyone on a UTC date. `owned` (by "slot:id") moves
 * what you already have to the back, so the shop shows what you could still get.
 */
export function shopFor(day: string, owned: (key: string) => boolean = () => false): Offer[] {
  const pool = dailyPool();
  const next = picker(hash(`shop-${day}`));
  // The day's order, the same for everyone; then what you own sinks (stable).
  const order = pool.map((item) => ({ item, r: next() })).sort((a, b) => a.r - b.r).map((x) => x.item);
  const fresh = order.filter((l) => !owned(keyOf(l)));
  const rest = order.filter((l) => owned(keyOf(l)));
  const ranked = [...fresh, ...rest];
  const n = Math.min(CONFIG.economy.shop.slots, pool.length);
  const picked: LookItem[] = [];
  // At least one premium look a day, so the shop always has something new.
  const premium = ranked.find((l) => l.unlock.by === 'cores');
  if (premium) picked.push(premium);
  // One of this season's generated looks, while there's one you don't own.
  const season = seasonAt(Date.parse(`${day}T12:00:00Z`)).season;
  const seasonal = fresh.find((l) => isSeasonShopLook(l, season));
  if (seasonal && picked.length < n) picked.push(seasonal);
  for (const l of ranked) {
    if (picked.length >= n) break;
    if (!picked.includes(l)) picked.push(l);
  }
  // The deal is any slot but the premium one.
  const dealAt = 1 + Math.floor(next() * (n - 1));
  return picked.map((item, i) => offerFor(item, i === dealAt));
}

// --- the day's picks, kept for the day ------------------------------------------------------------

const DAILY_KEY = 'endless.shopday';

interface Saved {
  day: string;
  picks: { key: string; deal: boolean }[];
}

export class DailyShop {
  private saved: Saved | null = null;

  async load(): Promise<void> {
    const raw = await storage.get(DAILY_KEY);
    if (!raw) return;
    try {
      this.saved = JSON.parse(raw) as Saved;
    } catch {
      this.saved = null;
    }
  }

  /** Today's offers: the saved picks if it's still the same day, else fresh ones (and saved). */
  offers(day: string, owned: (key: string) => boolean): Offer[] {
    if (this.saved?.day === day) {
      const out: Offer[] = [];
      for (const p of this.saved.picks) {
        const item = byKey(p.key);
        if (item && (item.unlock.by === 'credits' || item.unlock.by === 'cores')) out.push(offerFor(item, p.deal));
      }
      if (out.length > 0) return out;
    }
    const offers = shopFor(day, owned);
    this.saved = { day, picks: offers.map((o) => ({ key: keyOf(o.item), deal: o.deal })) };
    void storage.set(DAILY_KEY, JSON.stringify(this.saved));
    return offers;
  }
}

// --- the weekly set ---------------------------------------------------------------------------------

function shuffled(count: number, cycle: number): number[] {
  const next = picker(hash(`sets-${cycle}`));
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Which set is featured in the week starting on `week` (its Monday, YYYY-MM-DD). */
export function setOfWeek(week: string): LookSet {
  const n = Math.max(0, Math.floor((Date.parse(`${week}T00:00:00Z`) - EPOCH) / WEEK));
  const len = SETS.length;
  const cycle = Math.floor(n / len);
  // Every set once per cycle; the first of a cycle is never the last of the one before.
  let order = shuffled(len, 0);
  for (let c = 1; c <= cycle; c++) {
    const last = order[len - 1];
    order = shuffled(len, c);
    if (order[0] === last && len > 1) [order[0], order[1]] = [order[1], order[0]];
  }
  return SETS[order[n % len]];
}

export interface SetOffer {
  set: LookSet;
  items: LookItem[];
  missing: LookItem[];
  /** The bundle's price in cores, for what's missing. */
  price: number;
  /** What the missing looks cost one by one (cores' worth). */
  full: number;
  complete: boolean;
}

export function setOffer(week: string, owned: (key: string) => boolean): SetOffer {
  const set = setOfWeek(week);
  const items = set.items.map((k) => byKey(k) as LookItem);
  const missing = items.filter((l) => !owned(keyOf(l)));
  const full = Math.round(missing.reduce((n, l) => n + coresWorth(l), 0));
  const price = missing.length === 0 ? 0 : Math.max(5, Math.ceil((full * CONFIG.economy.shop.setDiscount) / 5) * 5);
  return { set, items, missing, price, full, complete: missing.length === 0 };
}

// --- the vault ----------------------------------------------------------------------------------------

export interface VaultOffer {
  item: LookItem;
  price: number; // cores
  /** Milliseconds until it goes. */
  leaves: number;
}

/** The vault look for the UTC month containing `ms`. */
export function vaultAt(ms: number): VaultOffer {
  const d = new Date(ms);
  const month = d.getUTCFullYear() * 12 + d.getUTCMonth();
  const item = byKey(VAULT_ORDER[month % VAULT_ORDER.length]) as LookItem;
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return { item, price: (item.unlock as { cost: number }).cost, leaves: end - ms };
}
