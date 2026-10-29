// When the game points at something to buy: after a run (what its credits now
// buy, or what's just out of reach) and when a tap finds the wallet short.

/** Something credits buy: an upgrade's next tier or a look in today's shop. */
export interface Buyable {
  name: string;
  cost: number;
  where: 'hangar' | 'shop';
}

export type RunNudge = { kind: 'afford'; item: Buyable } | { kind: 'close'; item: Buyable; short: number } | null;

/** How near "close" is: within this share of the price. */
export const CLOSE_FRACTION = 0.2;

/**
 * After a run: the cheapest thing this run's credits put in reach (couldn't
 * afford it before, can now), else the thing closest to reach (within 20%).
 */
export function runNudge(before: number, after: number, items: readonly Buyable[]): RunNudge {
  const newly = items.filter((i) => i.cost > before && i.cost <= after).sort((a, b) => a.cost - b.cost);
  if (newly.length > 0) return { kind: 'afford', item: newly[0] };
  const near = items.filter((i) => i.cost > after && i.cost - after <= i.cost * CLOSE_FRACTION).sort((a, b) => a.cost - after - (b.cost - after));
  return near.length > 0 ? { kind: 'close', item: near[0], short: near[0].cost - after } : null;
}

/** A pack in the store, by what it gives. */
export interface Pack {
  id: string;
  amount: number;
}

export interface ShortOf {
  short: number;
  /** Cores to swap for the credits that are missing; null when there aren't enough cores (or it's cores that are short). */
  swap: number | null;
  /** The smallest pack that covers it; null when none is big enough. */
  pack: Pack | null;
}

/** A tap on something the wallet can't cover: what's missing and the ways to make it up. */
export function shortOf(need: number, have: number, packs: readonly Pack[], swap?: { cores: number; creditsPerCore: number }): ShortOf {
  const short = Math.max(0, need - have);
  const pack = [...packs].sort((a, b) => a.amount - b.amount).find((p) => p.amount >= short) ?? null;
  let cores: number | null = null;
  if (swap) {
    const n = Math.ceil(short / swap.creditsPerCore);
    cores = n > 0 && n <= swap.cores ? n : null;
  }
  return { short, swap: cores, pack };
}

/** At most one store prompt a session that the player didn't ask for. */
export class StorePrompts {
  private used = false;

  /** True (and counted) if an unasked prompt may show now. */
  take(): boolean {
    if (this.used) return false;
    this.used = true;
    return true;
  }
}
