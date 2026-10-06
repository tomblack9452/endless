import { storage } from '../storage';

// What the player has bought for good: the one-off premium unlock and the
// starter pack. The whole game asks this, never the store directly. It's filled
// from three places, and anything any of them says is owned stays owned:
//   - this device (purchases made here, kept in storage)
//   - the store (RevenueCat restores, on a new install)
//   - the server (the purchase webhook writes them to the account)
// The season pass's premium track is per season, so the pass keeps that itself.

export type Entitlement = 'premium' | 'starter';

const KEY = 'endless.entitlements';
/** Older saves kept bought one-time products by product id. */
const OLD_KEY = 'endless.purchases';

/** The entitlement a product gives, if it's a one-time one. */
export function entitlementFor(productId: string): Entitlement | null {
  if (productId === 'premium') return 'premium';
  if (productId === 'starter_pack') return 'starter';
  return null;
}

export class Entitlements {
  private owned = new Set<Entitlement>();

  async load(): Promise<void> {
    for (const key of [KEY, OLD_KEY]) {
      try {
        for (const id of JSON.parse((await storage.get(key)) ?? '[]') as string[]) {
          const e = key === KEY ? (id as Entitlement) : entitlementFor(id);
          if (e === 'premium' || e === 'starter') this.owned.add(e);
        }
      } catch {
        // Corrupt value: nothing from it.
      }
    }
  }

  has(e: Entitlement): boolean {
    return this.owned.has(e);
  }

  /** Own it (a purchase, a restore, the server); returns true if it's new. */
  grant(e: Entitlement): boolean {
    if (this.owned.has(e)) return false;
    this.owned.add(e);
    void storage.set(KEY, JSON.stringify([...this.owned]));
    return true;
  }

  /** Dev: forget them all. */
  clear(): void {
    this.owned.clear();
    void storage.set(KEY, '[]');
  }
}
