// The store's offers outside the store (1.0.14): the starter offer that runs
// out, and the one card on the title that points at the store. Plain rules,
// unit tested; screens/title.ts and screens/shop.ts show them.

/** The starter offer: from the 3rd run, for 48 hours from when it first shows. */
export const STARTER = { afterRuns: 3, hours: 48 };
/** The title's store card waits until a player's 3rd run (their first two are for flying). */
export const STORE_CARD_AFTER_RUNS = 2;

/** What's kept (endless.offers, in the cloud save): when the starter offer first showed, and whether a pack was ever bought. */
export interface OfferState {
  starterAt?: number;
  packBought?: boolean;
  /** Hangar slots whose "try it on" hint has shown. */
  tryOn?: string[];
}

/** The starter offer's time left (ms), or null when it isn't on: too early, owned, or run out. */
export function starterLeft(s: OfferState, now: number, runs: number, owned: boolean): number | null {
  if (owned || runs < STARTER.afterRuns) return null;
  const start = s.starterAt ?? now;
  const left = start + STARTER.hours * 3_600_000 - now;
  return left > 0 ? left : null;
}

/** A sale running now (the server's store_sales). */
export interface Sale {
  product: string;
  label: string;
  endsAt: number;
}

/** A pack in the store, for the week's pick. */
export interface PackInfo {
  id: string;
  kind: 'credits' | 'cores';
  bonus: number;
}

/** This week's pack on the title: the best value of credits one week, of cores the next, the same for everyone. */
export function weeklyPack(week: string, packs: readonly PackInfo[]): PackInfo | null {
  const n = Math.floor(Date.parse(`${week}T00:00:00Z`) / (7 * 86_400_000));
  const kind = n % 2 === 0 ? 'credits' : 'cores';
  const best = (k: string) => packs.filter((p) => p.kind === k).sort((a, b) => b.bonus - a.bonus)[0] ?? null;
  return best(kind) ?? best(kind === 'credits' ? 'cores' : 'credits');
}

export type StoreCardPick =
  | { kind: 'sale'; sale: Sale }
  | { kind: 'starter'; left: number }
  | { kind: 'pass'; waiting: number }
  | { kind: 'pack'; pack: PackInfo };

/**
 * What the title's store card shows, first that applies: a running sale, the
 * starter offer, premium pass rewards waiting, then the week's pack. Null in a
 * player's first runs and where nothing can be bought (the web).
 */
export function storeCard(o: {
  canBuy: boolean;
  runs: number;
  sale: Sale | null;
  starterLeft: number | null;
  passWaiting: number;
  week: PackInfo | null;
}): StoreCardPick | null {
  if (!o.canBuy || o.runs < STORE_CARD_AFTER_RUNS) return null;
  if (o.sale) return { kind: 'sale', sale: o.sale };
  if (o.starterLeft !== null) return { kind: 'starter', left: o.starterLeft };
  if (o.passWaiting > 0) return { kind: 'pass', waiting: o.passWaiting };
  return o.week ? { kind: 'pack', pack: o.week } : null;
}

/** Product ids of the packs that double on a first purchase (cores and credits, not the starter pack). */
export const PACK_ID = /^(cores|credits)_\d+$/;

/** Whether the server's purchase records hold a pack (bought, or bought and refunded). */
export function boughtPack(products: readonly string[]): boolean {
  return products.some((p) => PACK_ID.test(p.replace(/^refund(ed)?:/, '')));
}
