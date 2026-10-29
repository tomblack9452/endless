import { errorLog } from '../platform/errors';
import { migrateTickets } from '../progression/legacy';
import { entitlementFor } from '../store/entitlements';
import { rankName } from '../progression/ranks';
import { shareAvailable, shareCard } from '../platform/share';
import { leagueName } from '../progression/leagues';
import { formatScore } from '../ui/ui';
import type { Game } from './game';
import PASS_ICON from '../assets/icons/pass.svg?raw';

export class Connection {
  constructor(private readonly g: Game) {}

  /** Asking the server whether it's back, and when it was last asked (the device's clock). */
  private rechecking = false;

  /** This run set a new personal best (the share card says so). */
  private shareNew = false;

  /** Sign in and sync with the server, if there is one (see src/server). */
  async connect(): Promise<void> {
    // The server's clock may have come after start-up stopped waiting: check today by it (asking again if need be).
    if (this.g.backend.clockKnown || (await this.g.backend.syncClock())) this.g.retime();
    errorLog.attach(this.g.backend, () => this.g.settingsScreen.errorScreen());
    if (!(await this.signInAndSync())) return;
    const refund = await migrateTickets((n) => this.g.wallet.addCores(n, 'tickets'));
    if (refund > 0) {
      this.g.ui.showNotice(`ranked is unlimited now: your spare tickets became ${formatScore(refund)} cores`);
      this.g.title.refreshTitle();
    }
    // What the account has bought, as the server's purchase records have it.
    const records = (await this.g.backend.purchases()) ?? [];
    const bought = [...new Set(records.map((r) => r.product))];
    for (const id of bought) this.g.purchases.grantProduct(id);
    const pass = this.g.purchases.restorePass(records);
    if (pass) this.g.ui.celebrate([{ kicker: 'season pass', icon: PASS_ICON, name: 'premium restored', lines: pass }]);
    // Refunded (and not bought again): no longer owned on this device either.
    for (const id of bought) {
      const e = id.startsWith('refunded:') ? entitlementFor(id.slice(9)) : null;
      if (e && !bought.some((b) => entitlementFor(b) === e)) this.g.entitlements.revoke(e);
    }
    this.g.applyLooks();
    await this.g.store.start(this.g.backend.userId);
    void this.g.ads.start().then(() => {
      const row = document.getElementById('privacy-choices');
      if (row) row.hidden = !this.g.ads.privacyRequired; // Google asks for a way back to the consent form here
    });
    this.g.storeProducts = await this.g.store.products();
    if (this.g.infoOpen === 'store') this.g.shop.openStore();
  }

  /**
   * Sign in, then bring the cloud save, the wallet and the waiting runs up to
   * date. False if the cloud save was newer and the game is starting again
   * from it. Started offline, it runs again when the server comes back (recheck).
   */
  private async signInAndSync(): Promise<boolean> {
    if (!(await this.g.backend.signIn())) return true;
    void errorLog.send(); // anything noted before signing in
    if (await this.g.cloud.start()) {
      location.reload(); // the cloud save is newer: start again from it
      return false;
    }
    await this.g.wallet.link(this.g.backend);
    await this.g.checkMaxOut();
    this.g.title.refreshTitle();
    this.g.queueShip();
    void this.g.account.askName();
    void this.g.outbox.flush(); // runs that couldn't be sent last time
    return true;
  }

  /** The end screen's share button: for a new personal best in any mode, and every ranked run. */
  offerShare(isNew: boolean): void {
    this.shareNew = isNew && !this.g.assisted && this.g.score > 0;
    this.g.ui.showShare((this.shareNew || this.g.mode === 'ranked') && shareAvailable());
  }

  /** A picture of this run for the share sheet: the score, the mode or board, and your ship, in the store art's dusk. */
  async share(): Promise<void> {
    const lg = this.g.leagues;
    const lines: string[] = [];
    if (this.g.mode === 'ranked')
      lines.push(
        `${rankName(this.g.ranked.rank)} · ${leagueName(lg.league, lg.division)}`,
        `best this week ${formatScore(this.g.progress.weeklyBest(this.g.weekly.id))}`,
      );
    else if (this.g.dailyRunNow) {
      const streak = this.g.challenge.streakOn(this.g.dailyRunNow.day);
      lines.push(streak > 1 ? `${streak} days in a row` : 'the same course for everyone today');
    } else lines.push(rankName(this.g.ranked.rank));
    const outcome = await shareCard({
      score: formatScore(this.g.score),
      mode: this.g.modeLabel(),
      kicker: this.shareNew ? 'new best' : '',
      lines,
      ship: this.g.portraits.get(this.g.shipLook(), 4),
    });
    if (outcome === 'saved') this.g.ui.showNotice('share card saved');
    else if (outcome === 'unavailable') this.g.ui.showNotice("sharing isn't available here");
  }

  /** There's a server, but it can't be reached right now (no signal, or it's down). Everything on the device carries on. */
  offline(): boolean {
    return this.g.backend.online && (!this.g.backend.reachable || (typeof navigator !== 'undefined' && navigator.onLine === false));
  }

  /** Offline: ask the server for the time now and then (it needs no sign-in), and pick everything up again when it answers. */
  async recheck(): Promise<void> {
    if (!this.offline() || this.rechecking) return;
    this.rechecking = true;
    try {
      if (!(await this.g.backend.syncClock())) return;
      this.g.retime();
      if (!this.g.backend.userId) await this.signInAndSync();
      else {
        void this.g.outbox.flush();
        void errorLog.send();
        void this.g.wallet.refresh().then(() => this.g.title.refreshTitle());
      }
    } finally {
      this.rechecking = false;
      this.g.refreshBar();
    }
  }
}
