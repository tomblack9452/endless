import { analytics } from '../platform/analytics';
import { CONFIG } from '../core/config';
import { premiumReward, freeReward, seasonAt } from '../economy/pass';
import { rewardText } from '../economy/reward';
import { asksBeforeSpending, setOffer, vaultAt } from '../economy/shop';
import { dayKey, formatWait, untilTomorrow } from '../economy/time';
import type { StoreButton, StoreCard } from '../economy/view';
import type { ProductId } from '../store/store';
import { storage } from '../core/storage';
import { weekKey } from '../progression/leagues';
import { VAULT_ORDER } from '../ship/catalogue';
import { lookIcon, lookSwatch } from '../ship/hangar';
import { byKey, keyOf, type LookItem, type Slot, SLOT_NAMES } from '../ship/looks';
import { formatScore } from '../ui/ui';
import type { Game } from '../core/game';
import PASS_ICON from '../assets/icons/pass.svg?raw';
import WALLET_ICON from '../assets/icons/wallet.svg?raw';
import { mergeCredits } from '../ui/format';

/** The shop's tabs: looks as cards (today, the set, the vault), then lists (the pass, cores, premium). */
type ShopTab = 'today' | 'set' | 'vault';

/** The first look at the shop or the store says what credits and cores are for (once, on this save). */
const WALLET_EXPLAINED_KEY = 'endless.walletExplained';

/** Where the store was opened from, for the analytics funnel. */
export type StoreSource = 'dock' | 'wallet' | 'shop' | 'short' | 'results' | 'hub';

export class ShopScreens {
  constructor(private readonly g: Game) {}

  /** How the store was reached this time. */
  source: StoreSource = 'dock';

  private walletExplained = false; // looked at this session whether the wallet card was shown

  private shopTab: ShopTab = 'today';

  /** The weekly set shown all at once (a grid), not as a row. */
  private shopGrid = false;

  /** The whole weekly set is on the ship to try. */
  private shopTrying = false;

  /** The cards for the open shop tab, and the line, heading and buy button that go with them. */
  private shopTabView(
    now: number,
    owned: (key: string) => boolean,
  ): {
    heading: string;
    reset: string;
    info: string;
    items: LookItem[];
    cards: { price: string; premium: boolean; deal: boolean }[];
    buy: { text: string; enabled: boolean };
  } {
    const priceOf = (item: LookItem): string => {
      const u = item.unlock;
      return u.by === 'credits' ? `${formatScore(u.cost)} credits` : u.by === 'cores' || u.by === 'vault' ? `${formatScore(u.cost)} cores` : '';
    };
    if (this.shopTab === 'set') {
      const week = weekKey(now);
      const so = setOffer(week, owned);
      const left = Date.parse(`${week}T00:00:00Z`) + 7 * 86_400_000 - now;
      const saved = so.full - so.price;
      return {
        heading: so.set.name,
        reset: `this week · new in ${formatWait(left)}`,
        info: so.complete
          ? `you have the whole set. its bonus of ${so.set.bonusCores} cores is yours`
          : `${so.missing.length} of ${so.items.length} looks left · the lot for ${formatScore(so.price)} cores, ${formatScore(saved)} less than one by one · own the whole set for +${so.set.bonusCores} cores`,
        items: so.items,
        cards: so.items.map((item) => ({ price: priceOf(item), premium: item.unlock.by === 'cores', deal: false })),
        buy: so.complete ? { text: 'set complete', enabled: false } : { text: `buy the set · ${formatScore(so.price)} cores`, enabled: true },
      };
    }
    if (this.shopTab === 'vault') {
      const v = vaultAt(now);
      const mine = owned(keyOf(v.item));
      return {
        heading: 'the vault',
        reset: `leaves in ${formatWait(v.leaves)}`,
        info: `a rare look, for sale a month at a time. when it goes it's away for ${VAULT_ORDER.length - 1} months`,
        items: [v.item],
        cards: [{ price: priceOf(v.item), premium: true, deal: false }],
        buy: mine ? { text: `${v.item.name} is yours`, enabled: false } : { text: `buy ${v.item.name} · ${formatScore(v.price)} cores`, enabled: true },
      };
    }
    const offers = this.g.dailyShop.offers(dayKey(now), owned);
    const f = offers[this.g.shopPick];
    let buy: { text: string; enabled: boolean } = { text: 'tap a look to try it on', enabled: false };
    if (f) {
      if (owned(keyOf(f.item))) buy = { text: `${f.item.name} is on your ship`, enabled: false };
      else {
        const have = f.currency === 'cores' ? this.g.wallet.cores : this.g.wallet.credits;
        const price = `${formatScore(f.price)} ${f.currency}`;
        buy = have >= f.price ? { text: `buy ${f.item.name} · ${price}`, enabled: true } : { text: `${price} · you have ${formatScore(have)}`, enabled: true };
      }
    }
    return {
      heading: "today's looks",
      reset: `new in ${formatWait(untilTomorrow(now))}`,
      info: '',
      items: offers.map((o) => o.item),
      cards: offers.map((o) => ({ price: `${formatScore(o.price)} ${o.currency}`, premium: o.currency === 'cores', deal: o.deal })),
      buy,
    };
  }

  openShop(tab?: ShopTab): void {
    const now = this.g.now();
    if (tab) {
      this.shopTab = tab;
      this.g.shopPick = -1;
      this.shopTrying = false;
      this.g.preview = null;
      this.g.applyLooks();
    }
    const tabs = this.shopTabs();
    if (!tabs.some((t) => t.id === this.shopTab)) this.shopTab = 'today';
    const o = this.g.owner();
    const owned = (key: string): boolean => {
      const it = byKey(key);
      return !!it && this.g.looks.owns(it, o);
    };
    const v = this.shopTabView(now, owned);
    this.g.econ.renderShop({
      wallet: `${formatScore(this.g.wallet.credits)} credits · ${formatScore(this.g.wallet.cores)} cores`,
      reset: v.reset,
      tabs: tabs.map((t) => ({ ...t, note: this.shopTabNote(t.id, now), on: t.id === this.shopTab })),
      store: this.storeAd(now),
      heading: v.heading,
      kicker: this.shopTab === 'vault' ? 'rare · one month only' : '',
      info: v.info,
      offers: v.items.map((item, i) => ({
        name: item.name,
        slot: item.slot,
        slotName: SLOT_NAMES[item.slot],
        swatch: lookSwatch(item),
        icon: lookIcon(item),
        price: v.cards[i].price,
        premium: v.cards[i].premium,
        deal: v.cards[i].deal,
        owned: owned(keyOf(item)),
        picked: i === this.g.shopPick,
      })),
      set: this.shopTab === 'set' ? { grid: this.shopGrid, trying: this.shopTrying && this.g.preview !== null } : null,
      buy: v.buy,
    });
    this.g.player.reset();
    this.g.player.setVisible(true);
    this.g.trail.setVisible(true);
    this.g.openInfo('shop');
    void this.explainWallet();
  }

  /** The first time the shop or the store opens: what credits and cores are, and where each comes from (once). */
  private async explainWallet(): Promise<void> {
    if (this.walletExplained) return;
    this.walletExplained = true;
    if ((await storage.get(WALLET_EXPLAINED_KEY)) !== null) return;
    void storage.set(WALLET_EXPLAINED_KEY, '1');
    this.g.ui.celebrate([
      {
        kicker: 'your wallet',
        icon: WALLET_ICON,
        name: 'credits and cores',
        lines: [
          'credits: every run pays them. for looks and upgrades',
          'cores: rarer. from daily rewards, goals, the pass and the store',
          'for premium looks, the vault, revives and the pass',
        ],
      },
    ]);
  }

  /** The store's ad on the shop: the season's countdown, the pass's hook, and the best pack of cores. */
  private storeAd(now: number): { pass: { title: string; left: string; hook: string; tier: string; fraction: number }; cores: string } {
    this.g.pass.turn(now);
    const s = seasonAt(now);
    const tier = this.g.pass.tier;
    const tiers = CONFIG.economy.pass.tiers;
    // The biggest pack, with its bonus and (in the app) its price.
    let best: { id: ProductId; cores: number; bonus: number } | null = null;
    for (const p of CONFIG.economy.store.products) if ('cores' in p && 'bonus' in p && (!best || p.cores > best.cores)) best = p;
    const price = best && this.g.storeProducts.find((p) => p.id === best.id)?.price;
    const cores = best ? `up to ${formatScore(best.cores)}${best.bonus ? ` · +${best.bonus}%` : ''}${price ? ` · ${price}` : ''}` : '';
    const hook = this.g.pass.premium
      ? 'premium · every reward is yours'
      : tier > 0
        ? `${tier} premium reward${tier === 1 ? '' : 's'} waiting`
        : 'premium rewards on every tier';
    return {
      pass: {
        title: `season ${s.season} pass`,
        left: `${s.end - now > 2 * 86_400_000 ? `${Math.ceil((s.end - now) / 86_400_000)}d` : formatWait(s.end - now)} left`,
        hook,
        tier: `${tier}/${tiers}`,
        fraction: tier / tiers,
      },
      cores,
    };
  }

  /** Under each tab: when it turns over. */
  private shopTabNote(id: ShopTab, now: number): string {
    if (id === 'set') return formatWait(Date.parse(`${weekKey(now)}T00:00:00Z`) + 7 * 86_400_000 - now);
    if (id === 'vault') return formatWait(vaultAt(now).leaves);
    return formatWait(untilTomorrow(now));
  }

  /** The looks shop's tabs (the store, for cores and the pass, is its own screen). */
  private shopTabs(): { id: ShopTab; label: string }[] {
    return [
      { id: 'today', label: 'today' },
      { id: 'set', label: 'weekly set' },
      { id: 'vault', label: 'vault' },
    ];
  }

  onShopTab = (id: string): void => {
    if (id === 'store' || id === 'store-cores') {
      this.openStore('shop', 'shop');
      // Buy cores: straight to the packs, past the pass.
      if (id === 'store-cores') requestAnimationFrame(() => document.getElementById('store-packs-head')?.scrollIntoView({ block: 'start' }));
      return;
    }
    if (!this.shopTabs().some((t) => t.id === id)) return;
    this.openShop(id as ShopTab);
  };

  /** The store: the season pass first, then cores, the starter pack and premium, swaps, and restore. */
  /** `source` says what opened it (for usage stats); left out, it's the open store redrawn. */
  openStore(from?: 'shop' | null, source?: StoreSource): void {
    if (from !== undefined) this.g.storeFrom = from;
    if (source) {
      this.source = source;
      analytics.log('view_store', { source });
    }
    const now = this.g.now();
    this.g.pass.turn(now);
    const P = CONFIG.economy.pass;
    const s = seasonAt(now);
    const tier = this.g.pass.tier;
    const price = new Map(this.g.storeProducts.map((p) => [p.id, p.price]));
    const app = this.g.store.available;
    // A real-money button: the store's price, or why it can't be bought here.
    const money = (id: ProductId): StoreButton => {
      const p = price.get(id);
      return p ? { act: id, text: p, enabled: true, primary: true } : { act: id, text: app ? 'unavailable' : 'in the app', enabled: false };
    };
    const owned = (text: string): StoreButton => ({ act: '', text, enabled: false });

    const passButtons: StoreButton[] = [];
    const perks: string[] = [];
    if (this.g.pass.premium) {
      perks.push(`season ${s.season}'s premium track is yours`, 'premium rewards are paid at every tier you reach');
      passButtons.push({ act: 'pass-open', text: 'see the tiers', enabled: true });
    } else {
      const next = Math.min(tier + 1, P.tiers);
      perks.push(
        'more at every tier, on top of the free track',
        "the season's new looks",
        `next up: ${rewardText(premiumReward(next, s.season))} at tier ${next}`,
      );
      if (tier > 0) perks.push(`the ${tier} tier${tier === 1 ? '' : 's'} you've reached pay out as you unlock`);
      passButtons.push({
        act: 'pass-cores',
        text: `unlock · ${formatScore(P.premiumCores)} cores`,
        enabled: this.g.wallet.cores >= P.premiumCores,
        primary: this.g.wallet.cores >= P.premiumCores,
      });
      const m = price.get('season_pass');
      if (m) passButtons.push({ act: 'season_pass', text: `unlock · ${m}`, enabled: true });
      passButtons.push({ act: 'pass-open', text: 'see the tiers', enabled: true });
    }

    const packs: StoreCard[] = [];
    const creditPacks: StoreCard[] = [];
    const extras: StoreCard[] = [];
    // Each row's biggest bonus is its best value.
    const bestOf = (kind: 'cores' | 'credits'): number => Math.max(0, ...CONFIG.economy.store.products.map((p) => (kind in p && 'bonus' in p ? p.bonus : 0)));
    const tag = (bonus: number, kind: 'cores' | 'credits'): string => (bonus > 0 && bonus === bestOf(kind) ? 'best value' : '');
    const more = (bonus: number): string => (bonus > 0 ? `+${bonus}% more for the price` : '');
    for (const p of CONFIG.economy.store.products) {
      const img = `store/${p.id}.png`;
      if ('look' in p) {
        const mine = this.g.purchases.ownsProduct(p.id);
        extras.push({
          img,
          name: 'starter pack',
          sub: `${formatScore(p.cores)} cores and ${rewardText({ look: p.look })}`,
          tag: 'once',
          button: mine ? owned('owned') : money(p.id),
          owned: mine,
        });
      } else if ('premium' in p) {
        const mine = this.g.entitlements.has('premium');
        extras.push({
          img,
          name: 'premium',
          sub: mine ? 'yours. thank you' : 'no ads, ad rewards without the ad, three premium looks, an extra free revive a day, a badge on the boards',
          tag: '',
          button: mine ? owned('owned') : money(p.id),
          owned: mine,
        });
      } else if ('cores' in p)
        packs.push({ img, name: `${formatScore(p.cores)} cores`, sub: more(p.bonus), tag: tag(p.bonus, 'cores'), button: money(p.id), owned: false });
      else if ('credits' in p)
        creditPacks.push({
          img,
          name: `${formatScore(p.credits)} credits`,
          sub: more(p.bonus),
          tag: tag(p.bonus, 'credits'),
          button: money(p.id),
          owned: false,
        });
    }
    // Once a day, a few cores for an ad: first in the row, so a free taste sits beside the packs.
    if (this.g.revives.freeCoresOffered()) {
      packs.unshift({
        img: 'store/cores_100.png',
        name: `${CONFIG.ads.freeCores} cores`,
        sub: 'free · once a day',
        tag: 'free',
        button: { act: 'free-cores', text: 'watch an ad', enabled: true, primary: true },
        owned: false,
      });
      this.g.revives.adShown('freeCores');
    }
    const packsNote = !app
      ? 'packs of credits and cores, the starter pack and premium are in the android app'
      : this.g.storeProducts.length === 0
        ? "the store isn't answering. check your connection and come back"
        : '';

    const S = CONFIG.economy.shop;
    const foot: { label: string; button: StoreButton }[] = [];
    if (app) foot.push({ label: 'bought on another device?', button: { act: 'restore', text: 'restore', enabled: true } });
    if (import.meta.env.DEV) {
      foot.push({ label: 'dev: add cores (purchases stand-in)', button: { act: 'dev', text: '+500', enabled: true } });
      foot.push({ label: 'dev: premium on/off', button: { act: 'dev-premium', text: 'toggle', enabled: true } });
    }
    this.g.econ.renderStore({
      wallet: `${formatScore(this.g.wallet.credits)} credits · ${formatScore(this.g.wallet.cores)} cores`,
      pass: {
        title: `season ${s.season}`,
        left: `ends in ${formatWait(s.end - now)}`,
        tier: `tier ${tier} of ${P.tiers}`,
        fraction: Math.min(1, (tier + (tier >= P.tiers ? 0 : this.g.pass.tierFraction)) / P.tiers),
        perks,
        buttons: passButtons,
      },
      packs,
      creditPacks,
      packsNote,
      extras,
      swapNote: `${formatScore(S.swapCredits)} credits for every core`,
      swaps: S.swaps.map((n) => ({
        act: `swap-${n}`,
        text: `${formatScore(n)} cores → ${formatScore(n * S.swapCredits)} credits`,
        enabled: this.g.wallet.cores >= n,
      })),
      foot,
    });
    if (this.g.state === 'title') {
      // No showroom here: the ship only shows on the screens that show it off.
      this.g.preview = null;
      this.g.shopPick = -1;
      this.g.applyLooks();
      this.g.player.setVisible(false);
      this.g.trail.setVisible(false);
    }
    this.g.openInfo('store');
    void this.explainWallet();
  }

  /** Tap a look: it goes on the ship to try (owned ones are just put on). Tap again to take it off. */
  onShopOffer = (i: number): void => {
    const now = this.g.now();
    const o = this.g.owner();
    const owned = (key: string): boolean => {
      const it = byKey(key);
      return !!it && this.g.looks.owns(it, o);
    };
    const item = this.shopTabView(now, owned).items[i];
    if (!item) return;
    this.shopTrying = false; // one look again, not the whole set
    if (this.g.shopPick === i && !owned(keyOf(item))) {
      this.g.shopPick = -1;
      this.g.preview = null;
    } else {
      this.g.shopPick = i;
      if (owned(keyOf(item))) {
        this.g.preview = null;
        this.g.looks.equip(item.slot, item.id);
      } else this.g.preview = { [item.slot]: item.id };
    }
    this.g.haptics.pickup();
    this.g.applyLooks();
    this.openShop();
  };

  /** The weekly set's buttons: every look at once or back to a row, and the whole set on the ship (tap again to take it off). */
  onShopSet = (act: 'grid' | 'try'): void => {
    if (this.shopTab !== 'set') return;
    if (act === 'grid') this.shopGrid = !this.shopGrid;
    else if (this.shopTrying && this.g.preview) {
      this.shopTrying = false;
      this.g.preview = null;
    } else {
      const o = this.g.owner();
      const items = setOffer(weekKey(this.g.now()), (key) => {
        const it = byKey(key);
        return !!it && this.g.looks.owns(it, o);
      }).items;
      // One look per slot, all on at once. Nothing is put on for keeps.
      const all: Partial<Record<Slot, string>> = {};
      for (const item of items) all[item.slot] ??= item.id;
      this.g.preview = all;
      this.shopTrying = true;
      this.g.shopPick = -1;
      this.g.haptics.pickup();
    }
    this.g.applyLooks();
    this.openShop();
  };

  /** Something was bought: put it on, play the sound, and see whether it finished a goal or a set. */
  afterBuy(items: LookItem[], notice: string): void {
    for (const item of items) this.g.looks.equip(item.slot, item.id);
    this.g.preview = null;
    this.shopTrying = false;
    this.g.sound.pickup();
    this.g.haptics.pickup();
    this.g.ui.showNotice(notice);
    this.g.applyLooks();
    this.g.title.refreshTitle();
    this.g.checkGoals();
  }

  onShopBuy = (): void => {
    const now = this.g.now();
    const o = this.g.owner();
    const owned = (key: string): boolean => {
      const it = byKey(key);
      return !!it && this.g.looks.owns(it, o);
    };
    if (this.shopTab === 'set') {
      const so = setOffer(weekKey(now), owned);
      if (so.complete) return;
      if (this.g.wallet.cores < so.price) return this.g.shortOf.show('cores', so.price, so.set.name, () => this.onShopBuy());
      this.confirmCores(so.price, `${so.set.name}: ${so.missing.length} look${so.missing.length === 1 ? '' : 's'}`, () => {
        if (!this.g.wallet.spendCores(so.price)) return;
        for (const item of so.missing) this.g.looks.buy(item);
        this.afterBuy(so.items, `${so.set.name} bought and on your ship`);
        this.openShop();
      });
    } else if (this.shopTab === 'vault') {
      const v = vaultAt(now);
      if (owned(keyOf(v.item))) return;
      if (this.g.wallet.cores < v.price) return this.g.shortOf.show('cores', v.price, v.item.name, () => this.onShopBuy());
      this.confirmCores(v.price, `${v.item.name} from the vault`, () => {
        if (!this.g.wallet.spendCores(v.price)) return;
        this.g.looks.buy(v.item);
        this.afterBuy([v.item], `${v.item.name} from the vault is on your ship`);
        this.openShop();
      });
    } else {
      const f = this.g.dailyShop.offers(dayKey(now), owned)[this.g.shopPick];
      if (!f || owned(keyOf(f.item))) return;
      const have = f.currency === 'cores' ? this.g.wallet.cores : this.g.wallet.credits;
      if (have < f.price) return this.g.shortOf.show(f.currency, f.price, f.item.name, () => this.onShopBuy());
      const buy = (): void => {
        const paid = f.currency === 'cores' ? this.g.wallet.spendCores(f.price) : this.g.wallet.spend(f.price, 'look');
        if (!paid) return;
        this.g.looks.buy(f.item);
        this.afterBuy([f.item], `${f.item.name} bought and on your ship`);
        this.openShop();
      };
      if (f.currency === 'cores') this.confirmCores(f.price, f.item.name, buy);
      else buy();
    }
  };

  /** Spend cores on `what`: straight away for small amounts, after a "spend N cores?" for larger ones (CONFIG.economy.confirmCores). */
  confirmCores(cost: number, what: string, go: () => void): void {
    if (!asksBeforeSpending(cost)) return go();
    this.g.econ.offer(
      {
        kicker: '',
        name: `spend ${formatScore(cost)} cores?`,
        lines: [what, `you have ${formatScore(this.g.wallet.cores)} cores`],
        yes: `buy · ${formatScore(cost)} cores`,
        yesEnabled: this.g.wallet.cores >= cost,
        no: 'not now',
        seconds: 0,
      },
      go,
      () => undefined,
    );
  }

  /** A store button (its data-act): the pass, a real purchase, a swap, restore, or a dev stand-in. */
  onStoreAct = (act: string): void => {
    if (act === 'dev' && import.meta.env.DEV) {
      this.g.devTools.devAddCores(500);
      this.openStore();
    } else if (act === 'dev-premium' && import.meta.env.DEV) {
      this.g.devTools.devTogglePremium();
      this.openStore();
    } else if (act === 'pass-cores') this.onPassPremium();
    else if (act === 'pass-open') this.openPass('store');
    else if (act === 'restore') void this.g.purchases.restorePurchases();
    else if (act === 'free-cores') void this.g.revives.claimFreeCores();
    else if (act.startsWith('swap-')) this.swapCores(Number(act.slice(5)));
    else if (CONFIG.economy.store.products.some((p) => p.id === act)) void this.g.purchases.buyProduct(act as ProductId);
  };

  /** Cores into credits, at the shop's rate. */
  private swapCores(n: number): void {
    if (this.g.wallet.cores < n) {
      this.g.ui.showNotice('not enough cores');
      return;
    }
    this.confirmCores(n, `for ${formatScore(n * CONFIG.economy.shop.swapCredits)} credits`, () => {
      if (!this.g.wallet.spendCores(n, 'swap')) return;
      const lines = this.g.grant({ credits: n * CONFIG.economy.shop.swapCredits });
      this.g.ui.showNotice(lines.join(' · '));
      this.g.sound.pickup();
      this.g.title.refreshTitle();
      if (this.g.infoOpen === 'store') this.openStore();
    });
  }

  /** The season pass's tiers. `from: 'store'` makes Back return to the store. */
  openPass(from?: 'store' | null): void {
    if (from !== undefined) {
      this.g.passFrom = from;
      analytics.log('view_item', { item_id: 'season_pass', source: from ?? 'dock' });
    }
    const now = this.g.now();
    this.g.pass.turn(now);
    const P = CONFIG.economy.pass;
    const tier = this.g.pass.tier;
    const s = seasonAt(now);
    const maxed = tier >= P.tiers;
    const passPrice = this.g.storeProducts.find((p) => p.id === 'season_pass')?.price;
    this.g.econ.renderPass({
      big: maxed ? 'complete' : String(P.xpPerTier - (this.g.pass.xp % P.xpPerTier)),
      goal: maxed ? `all ${P.tiers} tiers` : `xp to tier ${tier + 1}`,
      fraction: this.g.pass.tierFraction,
      detail: `season ${s.season} · tier ${tier} of ${P.tiers} · ends in ${formatWait(s.end - now)}`,
      premium: this.g.pass.premium ? null : { text: `unlock premium · ${formatScore(P.premiumCores)} cores`, enabled: this.g.wallet.cores >= P.premiumCores },
      buy: passPrice ? `or unlock for ${passPrice}` : null,
      premiumOwned: this.g.pass.premium,
      tiers: Array.from({ length: P.tiers }, (_, i) => ({
        tier: i + 1,
        free: rewardText(freeReward(i + 1, s.season)),
        premium: rewardText(premiumReward(i + 1, s.season)),
        reached: i < tier,
        current: i === tier || (maxed && i === P.tiers - 1),
      })),
    });
    this.g.openInfo('pass');
  }

  onPassPremium = (): void => {
    const cost = CONFIG.economy.pass.premiumCores;
    if (this.g.pass.premium || this.g.wallet.cores < cost) return;
    this.confirmCores(cost, `season ${this.g.pass.season} pass: the premium track`, () => this.unlockPassWithCores());
  };

  private unlockPassWithCores(): void {
    // The reason tells the server this season's premium was paid in cores (a refund never touches it).
    if (this.g.pass.premium || !this.g.wallet.spendCores(CONFIG.economy.pass.premiumCores, `pass-premium:${this.g.pass.season}`)) return;
    const paid = this.g.pass.unlockPremium('cores');
    const lines = paid.flatMap((r) => this.g.grant(r));
    this.g.ui.celebrate([
      {
        kicker: 'season pass',
        icon: PASS_ICON,
        name: 'premium unlocked',
        lines: lines.length > 0 ? mergeCredits(lines) : ['premium rewards from every tier you reach'],
      },
    ]);
    this.g.sound.power();
    this.g.title.refreshTitle();
    if (this.g.infoOpen === 'store') this.openStore();
    else this.openPass();
  }
}
