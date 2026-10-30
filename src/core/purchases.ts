import { PACK_ID } from '../economy/offers';
import { analytics } from '../platform/analytics';
import { CONFIG } from './config';
import { entitlementFor } from '../store/entitlements';
import { passBought, passRefunded } from '../economy/pass';
import type { Purchase } from '../server/backend';
import type { ProductId } from '../store/store';
import { googleAvailable } from '../platform/account';
import { formatScore } from '../ui/ui';
import type { Game } from './game';
import GIFT_ICON from '../assets/icons/gift.svg?raw';
import PASS_ICON from '../assets/icons/pass.svg?raw';
import { mergeCredits } from '../ui/format';

export class Purchases {
  constructor(private readonly g: Game) {}

  /** Buy a real-money product through the app store, then deliver it. */
  async buyProduct(id: ProductId): Promise<void> {
    // With the server, a purchase is paid to the account (the webhook): no account known, no sale.
    if (this.g.backend.online) {
      if (!this.g.backend.userId) await this.g.backend.signIn();
      const user = this.g.backend.userId;
      if (!user || !(await this.g.store.identify(user))) {
        this.g.ui.showNotice("can't reach the server right now. nothing was charged. try again in a moment");
        return;
      }
    }
    analytics.log('begin_checkout', { item_id: id });
    const creditsBefore = this.g.wallet.credits;
    // A first pack of cores or credits pays double (the server's rule, 0028; the device's own without one).
    const times = PACK_ID.test(id) && this.g.offers.firstDouble ? 2 : 1;
    const result = await this.g.store.buy(id);
    if (result !== 'failed') analytics.log(result === 'cancelled' ? 'purchase_cancelled' : 'purchase', { item_id: id });
    if (result === 'cancelled') return;
    if (result === 'failed') {
      this.g.ui.showNotice("purchase didn't go through. nothing was charged");
      return;
    }
    const p = CONFIG.economy.store.products.find((x) => x.id === id)!;
    const lines: string[] = [];
    if (PACK_ID.test(id)) this.g.offers.markPackBought();
    if ('cores' in p) {
      const cores = p.cores * times;
      // With the server, the store's webhook pays the cores there: take its balance.
      if (this.g.backend.online) {
        const coresTarget = this.g.wallet.cores + cores;
        lines.push(`+${formatScore(cores)} cores`);
        void this.awaitPaid(() => this.g.wallet.cores >= coresTarget);
      } else lines.push(...this.g.grant({ cores }));
    }
    if ('credits' in p) {
      const credits = p.credits * times;
      // With the server, the webhook pays the credits there and the next sync brings them here.
      if (this.g.backend.online) {
        lines.push(`+${formatScore(credits)} credits`);
        void this.awaitPaid(() => this.g.wallet.credits >= creditsBefore + credits);
      } else lines.push(...this.g.grant({ credits }, `purchase:${id}`));
    }
    if (times === 2) lines.push('first purchase: doubled');
    if ('look' in p) lines.push(...this.g.grant({ look: p.look }));
    if ('pass' in p && !this.g.pass.premium) lines.push(...this.g.pass.unlockPremium('money').flatMap((r) => this.g.grant(r)), 'season pass premium');
    if ('premium' in p) lines.push('premium: no ads, ad rewards free, the halo hull, regalia paint and crown flame, an extra free revive a day');
    this.grantProduct(id);
    this.g.ui.celebrate([{ kicker: 'thank you', icon: GIFT_ICON, name: 'purchase complete', lines: mergeCredits(lines) }]);
    this.g.sound.power();
    this.g.title.refreshTitle();
    if (this.g.infoOpen === 'shop') this.g.shop.openShop();
    else if (this.g.infoOpen === 'store') this.g.shop.openStore();
    else if (this.g.infoOpen === 'pass') this.g.shop.openPass();
  }

  /**
   * The store's webhook pays a pack on the server a moment after the purchase
   * goes through. Check the server's balance until it's there (or about 20
   * seconds pass), then show it on whichever screen is open.
   */
  private async awaitPaid(arrived: () => boolean): Promise<void> {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => window.setTimeout(r, i === 0 ? 1000 : 2000));
      await this.g.wallet.link(this.g.backend);
      if (arrived()) break;
    }
    this.g.title.refreshTitle();
    if (this.g.infoOpen === 'shop') this.g.shop.openShop();
    else if (this.g.infoOpen === 'store') this.g.shop.openStore();
    else if (this.g.infoOpen === 'pass') this.g.shop.openPass();
    else if (this.g.infoOpen === 'hangar') this.g.hangarScreen.renderHangar(true);
  }

  /** True if a one-time product is owned (premium, the starter pack). */
  ownsProduct(id: string): boolean {
    const e = entitlementFor(id);
    return e !== null && this.g.entitlements.has(e);
  }

  /** Own a one-time product (bought, restored, or on the server's records); true if it's new here. */
  grantProduct(id: string): boolean {
    const e = entitlementFor(id);
    if (!e || !this.g.entitlements.grant(e)) return false;
    const p = CONFIG.economy.store.products.find((x) => x.id === id);
    if (p && 'look' in p) this.g.grant({ look: p.look });
    this.g.applyLooks();
    return true;
  }

  /**
   * A season pass bought for money this season (the server's records) unlocks
   * the premium track here too: a new install, or a purchase the app didn't
   * hear back about. Once only: an unlocked track is left alone. Returns the
   * lines to show, or null if nothing changed.
   */
  restorePass(records: readonly Purchase[]): string[] | null {
    const now = this.g.now();
    this.g.pass.turn(now);
    // Refunded (and not bought again): a track bought for money closes; one unlocked with cores stays.
    if (passRefunded(records, now) && this.g.pass.refund()) {
      this.g.ui.showNotice('your season pass was refunded, so its premium track is closed');
      void this.g.wallet.refresh(); // the server took back the cores its premium tiers paid
      this.g.title.refreshTitle();
      if (this.g.infoOpen === 'pass') this.g.shop.openPass();
      return null;
    }
    if (this.g.pass.premium || !passBought(records, now)) return null;
    const lines = this.g.pass.unlockPremium('money').flatMap((r) => this.g.grant(r));
    this.g.title.refreshTitle();
    if (this.g.infoOpen === 'pass') this.g.shop.openPass();
    else if (this.g.infoOpen === 'store') this.g.shop.openStore();
    return lines.length > 0 ? mergeCredits(lines) : ['premium rewards from every tier you reach'];
  }

  /** Restore one-time purchases on a new install (cores come back with the cloud save). */
  async restorePurchases(): Promise<void> {
    this.g.ui.showNotice('checking your purchases…');
    // Google Play's records for the Google account on this phone, and the server's for this game account.
    // At least two seconds, so the answer doesn't flash past the "checking" note.
    const wait = new Promise((r) => window.setTimeout(r, 2000));
    const [fromStore, fromServer] = await Promise.all([this.g.store.restore(), this.g.backend.purchases(), wait]);
    const ids = [...new Set([...fromStore, ...(fromServer ?? []).map((r) => r.product)])].filter((id) => !id.startsWith('refunded:'));
    let n = 0;
    for (const id of ids) if (this.grantProduct(id)) n++;
    const pass = this.restorePass(fromServer ?? []);
    if (pass) {
      n++;
      this.g.ui.celebrate([{ kicker: 'season pass', icon: PASS_ICON, name: 'premium restored', lines: pass }]);
    }
    const owned = ids.some((id) => entitlementFor(id) !== null && this.ownsProduct(id)) || (this.g.pass.premium && passBought(fromServer ?? [], this.g.now()));
    if (n > 0) this.g.ui.showNotice(`restored ${n} purchase${n === 1 ? '' : 's'}`);
    else if (owned) this.g.ui.showNotice('all your purchases are here');
    else if (googleAvailable() && !this.g.googleEmail) this.g.ui.showNotice('nothing to restore. bought on another phone? sign in with google');
    else this.g.ui.showNotice('nothing to restore');
    if (this.g.infoOpen === 'shop') this.g.shop.openShop();
    else if (this.g.infoOpen === 'store') this.g.shop.openStore();
    else if (this.g.infoOpen === 'pass') this.g.shop.openPass();
  }
}
