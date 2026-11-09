import { CONFIG } from '../core/config';
import type { Game } from '../core/game';
import { storage } from '../core/storage';
import { dayKey } from '../economy/time';
import { analytics } from '../platform/analytics';
import type { TitleCard } from '../ui/ui';
import GIFT_ICON from '../assets/icons/gift.svg?raw';

const KEY = 'endless.club';

interface Saved {
  /** Until when the membership runs (ms), as the store last said: kept so it holds offline. */
  until?: number;
  /** The UTC day the daily cores were last taken. */
  claimDay?: string;
}

/** Google Play's page for managing (and cancelling) the subscription. */
const MANAGE_URL = `https://play.google.com/store/account/subscriptions?sku=${CONFIG.economy.store.club.id}&package=com.tomblack.endlessspace`;

/**
 * The pilot's club: a monthly subscription (docs/store.md). While it runs: no
 * ads (ad rewards free), cores every day from a title card, and the season's
 * premium pass track. The store says whether it runs (RevenueCat); the server
 * checks it again before paying the daily cores.
 */
export class Club {
  private s: Saved = {};
  price: string | null = null;

  constructor(private readonly g: Game) {}

  async load(): Promise<void> {
    try {
      this.s = JSON.parse((await storage.get(KEY)) ?? '{}') as Saved;
    } catch {
      this.s = {};
    }
  }

  private save(): void {
    void storage.set(KEY, JSON.stringify(this.s));
  }

  get active(): boolean {
    return (this.s.until ?? 0) > this.g.now();
  }

  get until(): number | null {
    return this.active ? (this.s.until ?? null) : null;
  }

  /** Ask the store for the price and whether this account is a member (at start, after buying or restoring). */
  async refresh(): Promise<void> {
    const c = await this.g.store.club();
    this.price = c.price;
    // Only what the store said (a price or a membership): a store that didn't answer leaves the last known.
    if (c.until !== null || c.price !== null) {
      this.s.until = c.until ?? undefined;
      this.save();
    }
    this.apply();
  }

  /** A member gets the season's premium track (each season that starts while it runs). */
  apply(): void {
    if (!this.active || this.g.pass.premium) return;
    const lines = this.g.pass.unlockPremium('club').flatMap((r) => this.g.grant(r));
    this.g.ui.celebrate([{ kicker: "pilot's club", icon: GIFT_ICON, name: 'season pass premium', lines: ['yours while you are a member', ...lines] }]);
  }

  dailyReady(): boolean {
    return this.active && this.s.claimDay !== dayKey(this.g.now());
  }

  /** The title's card while a member: the day's cores to claim, or when the next come. */
  card(): TitleCard | null {
    if (!this.active) return null;
    const n = CONFIG.economy.store.club.dailyCores;
    return this.dailyReady()
      ? { id: 'club', kicker: "pilot's club", title: `${n} cores ready`, hot: true }
      : { id: 'club', kicker: "pilot's club", title: 'more cores tomorrow' };
  }

  claim(): void {
    if (!this.dailyReady()) return;
    const day = dayKey(this.g.now());
    this.s.claimDay = day;
    this.save();
    const lines = this.g.grant({ cores: CONFIG.economy.store.club.dailyCores }, `club:${day}`);
    this.g.ui.celebrate([{ kicker: "pilot's club", icon: GIFT_ICON, name: "today's cores", lines }]);
    this.g.sound.power();
    this.g.title.refreshTitle();
  }

  async buy(): Promise<void> {
    if (this.active) {
      window.open(MANAGE_URL, '_blank');
      return;
    }
    if (this.g.backend.online) {
      if (!this.g.backend.userId) await this.g.backend.signIn();
      const user = this.g.backend.userId;
      if (!user || !(await this.g.store.identify(user))) {
        this.g.ui.showNotice("can't reach the server right now. nothing was charged. try again in a moment");
        return;
      }
    }
    const id = CONFIG.economy.store.club.id;
    analytics.log('begin_checkout', { item_id: id });
    const r = await this.g.store.buyClub();
    if (r !== 'failed') analytics.log(r === 'cancelled' ? 'purchase_cancelled' : 'purchase', { item_id: id });
    if (r === 'failed') this.g.ui.showNotice("the subscription didn't go through. nothing was charged");
    if (r !== 'ok') return;
    await this.refresh();
    this.g.ui.celebrate([
      {
        kicker: 'thank you',
        icon: GIFT_ICON,
        name: "welcome to the pilot's club",
        lines: ['no ads, and ad rewards free', `${CONFIG.economy.store.club.dailyCores} cores every day on the title screen`, 'the season pass premium track'],
      },
    ]);
    this.g.title.refreshTitle();
    if (this.g.infoOpen === 'store') this.g.shop.openStore();
  }
}
