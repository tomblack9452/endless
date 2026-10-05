import { Capacitor } from '@capacitor/core';
import { CONFIG } from '../config';

// Real-money purchases. In the iOS and Android apps, RevenueCat handles the
// App Store and Google Play; on the web nothing is sold (the shop points to
// the apps). With the server on, RevenueCat's webhook credits cores there
// (supabase/functions/revenuecat-webhook); without it, the device credits them.

export type ProductId = (typeof CONFIG.economy.store.products)[number]['id'];

export interface StoreProduct {
  id: ProductId;
  price: string; // in the player's currency, from the store
}

export type BuyResult = 'ok' | 'cancelled' | 'failed';

export interface Store {
  /** True in the apps, with a key set. */
  readonly available: boolean;
  /** Connect, as `userId` (the server account) when there is one. */
  start(userId: string | null): Promise<void>;
  products(): Promise<StoreProduct[]>;
  buy(id: ProductId): Promise<BuyResult>;
  /** One-time products this account owns (restoring on a new device). */
  restore(): Promise<ProductId[]>;
}

class WebStore implements Store {
  readonly available = false;
  async start(): Promise<void> {}
  async products(): Promise<StoreProduct[]> {
    return [];
  }
  async buy(): Promise<BuyResult> {
    return 'failed';
  }
  async restore(): Promise<ProductId[]> {
    return [];
  }
}

type RevenueCat = typeof import('@revenuecat/purchases-capacitor');

class AppStore implements Store {
  readonly available = true;
  private rc: RevenueCat | null = null;
  private found = new Map<string, unknown>(); // store products by id, for buying

  constructor(private readonly key: string) {}

  async start(userId: string | null): Promise<void> {
    try {
      this.rc = await import('@revenuecat/purchases-capacitor');
      await this.rc.Purchases.configure({ apiKey: this.key, appUserID: userId ?? undefined });
    } catch {
      this.rc = null;
    }
  }

  async products(): Promise<StoreProduct[]> {
    if (!this.rc) return [];
    try {
      const ids = CONFIG.economy.store.products.map((p) => p.id);
      const { products } = await this.rc.Purchases.getProducts({ productIdentifiers: ids, type: this.rc.PRODUCT_CATEGORY.NON_SUBSCRIPTION });
      for (const p of products) this.found.set(p.identifier, p);
      return products.map((p) => ({ id: p.identifier as ProductId, price: p.priceString }));
    } catch {
      return [];
    }
  }

  async buy(id: ProductId): Promise<BuyResult> {
    const product = this.found.get(id);
    if (!this.rc || !product) return 'failed';
    try {
      await this.rc.Purchases.purchaseStoreProduct({ product: product as Parameters<RevenueCat['Purchases']['purchaseStoreProduct']>[0]['product'] });
      return 'ok';
    } catch (e) {
      return (e as { userCancelled?: boolean }).userCancelled ? 'cancelled' : 'failed';
    }
  }

  async restore(): Promise<ProductId[]> {
    if (!this.rc) return [];
    try {
      const { customerInfo } = await this.rc.Purchases.restorePurchases();
      return customerInfo.nonSubscriptionTransactions.map((t) => t.productIdentifier as ProductId);
    } catch {
      return [];
    }
  }
}

export function createStore(): Store {
  if (!Capacitor.isNativePlatform()) return new WebStore();
  const key = Capacitor.getPlatform() === 'ios' ? import.meta.env.VITE_REVENUECAT_APPLE_KEY : import.meta.env.VITE_REVENUECAT_GOOGLE_KEY;
  return key ? new AppStore(key) : new WebStore();
}
