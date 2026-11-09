import { Capacitor } from '@capacitor/core';
import { CONFIG } from '../core/config';
import { reportError } from '../platform/errors';

// Real-money purchases. In the iOS and Android apps, RevenueCat handles the
// App Store and Google Play; on the web nothing is sold (the shop points to
// the apps). With the server on, RevenueCat's webhook credits cores there
// (supabase/functions/revenuecat-webhook); without it, the device credits them.

export type ProductId = (typeof CONFIG.economy.store.products)[number]['id'];

export interface StoreProduct {
  id: ProductId;
  price: string; // in the player's currency, from the store
}

type BuyResult = 'ok' | 'cancelled' | 'failed';

export interface Store {
  /** True in the apps, with a key set. */
  readonly available: boolean;
  /** Connect, as `userId` (the server account) when there is one. */
  start(userId: string | null): Promise<void>;
  /** Buy as this server account from now on (it signed in after start). False if the store couldn't switch. */
  identify(userId: string): Promise<boolean>;
  products(): Promise<StoreProduct[]>;
  buy(id: ProductId): Promise<BuyResult>;
  /** One-time products this account owns (restoring on a new device). */
  restore(): Promise<ProductId[]>;
  /** The pilot's club subscription: its price (null if the store doesn't offer it), and until when this account has it (null: not subscribed). */
  club(): Promise<{ price: string | null; until: number | null }>;
  buyClub(): Promise<BuyResult>;
}

/** When a subscription runs until, from RevenueCat's customer info: the latest expiry among the club's ids ("pilots_club", or "pilots_club:monthly" on Google Play). */
export function clubUntil(info: { activeSubscriptions: string[]; allExpirationDates: Record<string, string | null> }, now: number): number | null {
  const id = CONFIG.economy.store.club.id;
  let until: number | null = null;
  for (const [key, date] of Object.entries(info.allExpirationDates)) {
    if (key.split(':')[0] !== id || !date) continue;
    const t = Date.parse(date);
    if (t > now && (until === null || t > until)) until = t;
  }
  // Active with no expiry given (a store that doesn't say): a day at a time.
  if (until === null && info.activeSubscriptions.some((s) => s.split(':')[0] === id)) until = now + 86_400_000;
  return until;
}

class WebStore implements Store {
  readonly available = false;
  async start(): Promise<void> {}
  async products(): Promise<StoreProduct[]> {
    return [];
  }
  async identify(): Promise<boolean> {
    return true;
  }
  async buy(): Promise<BuyResult> {
    return 'failed';
  }
  async restore(): Promise<ProductId[]> {
    return [];
  }
  async club(): Promise<{ price: null; until: null }> {
    return { price: null, until: null };
  }
  async buyClub(): Promise<BuyResult> {
    return 'failed';
  }
}

type RevenueCat = typeof import('@revenuecat/purchases-capacitor');

class AppStore implements Store {
  readonly available = true;
  private rc: RevenueCat | null = null;
  private found = new Map<string, unknown>(); // store products by id, for buying

  constructor(private readonly key: string) {}

  private user: string | null = null;

  async start(userId: string | null): Promise<void> {
    try {
      this.rc = await import('@revenuecat/purchases-capacitor');
      await this.rc.Purchases.configure({ apiKey: this.key, appUserID: userId ?? undefined });
      this.user = userId;
    } catch (e) {
      reportError('store start', e);
      this.rc = null;
    }
  }

  async identify(userId: string): Promise<boolean> {
    if (!this.rc) return false;
    if (this.user === userId) return true;
    try {
      await this.rc.Purchases.logIn({ appUserID: userId });
      this.user = userId;
      return true;
    } catch {
      return false;
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
      if ((e as { userCancelled?: boolean }).userCancelled) return 'cancelled';
      reportError(`purchase ${id}`, e);
      return 'failed';
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

  private clubProduct: unknown = null;

  async club(): Promise<{ price: string | null; until: number | null }> {
    if (!this.rc) return { price: null, until: null };
    try {
      const { products } = await this.rc.Purchases.getProducts({
        productIdentifiers: [CONFIG.economy.store.club.id],
        type: this.rc.PRODUCT_CATEGORY.SUBSCRIPTION,
      });
      this.clubProduct = products[0] ?? null;
      const { customerInfo } = await this.rc.Purchases.getCustomerInfo();
      return { price: products[0]?.priceString ?? null, until: clubUntil(customerInfo, Date.now()) };
    } catch {
      return { price: null, until: null };
    }
  }

  async buyClub(): Promise<BuyResult> {
    if (!this.rc || !this.clubProduct) return 'failed';
    try {
      await this.rc.Purchases.purchaseStoreProduct({ product: this.clubProduct as Parameters<RevenueCat['Purchases']['purchaseStoreProduct']>[0]['product'] });
      return 'ok';
    } catch (e) {
      if ((e as { userCancelled?: boolean }).userCancelled) return 'cancelled';
      reportError('purchase club', e);
      return 'failed';
    }
  }
}

export function createStore(): Store {
  if (!Capacitor.isNativePlatform()) return new WebStore();
  const key = Capacitor.getPlatform() === 'ios' ? import.meta.env.VITE_REVENUECAT_APPLE_KEY : import.meta.env.VITE_REVENUECAT_GOOGLE_KEY;
  return key ? new AppStore(key) : new WebStore();
}
