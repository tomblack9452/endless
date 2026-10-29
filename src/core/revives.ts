import { CONFIG } from './config';
import type { RewardedPlacement } from '../ads/ads';
import { questText } from '../economy/daily';
import { type AdPlacement, analytics } from '../platform/analytics';
import { dayKey } from '../economy/time';
import { formatScore } from '../ui/ui';
import type { Game } from './game';
import GIFT_ICON from '../assets/icons/gift.svg?raw';

const PLACEMENT: Record<RewardedPlacement, AdPlacement> = {
  revive: 'revive',
  doubleCredits: 'double_credits',
  dailyGift: 'daily_gift',
  rerollQuest: 'goal_swap',
};

export class Revives {
  private shownOnce = new Set<RewardedPlacement>();

  constructor(private readonly g: Game) {}

  /** An ad offer is on screen. The gift and goal swap sit there for a while, so they count once a session. */
  adShown(p: RewardedPlacement): void {
    if (!this.g.ads.showsAds) return;
    if (p === 'dailyGift' || p === 'rerollQuest') {
      if (this.shownOnce.has(p)) return;
      this.shownOnce.add(p);
    }
    analytics.log('ad_offer_shown', { placement: PLACEMENT[p] });
  }

  /** A revive is offered once a run, outside ranked, where the lane is known. */
  canRevive(): boolean {
    return this.g.mode !== 'ranked' && !this.g.dailyRunNow && !this.g.revived && this.g.world.laneAt(this.g.world.distance) !== null;
  }

  offerRevive(): void {
    const day = dayKey(this.g.now());
    const free = this.g.daily.freeRevivesLeft(day, this.freeRevivesADay()) > 0;
    // Out of free ones: a rewarded ad (free with premium) or cores, the player's pick.
    const byAd = !free && this.g.ads.offers('revive');
    const cost = CONFIG.economy.revive.coreCost;
    const cores = `revive · ${cost} cores`;
    if (byAd) this.adShown('revive');
    const byCores = (): void => {
      if (!this.g.wallet.spendCores(cost)) return this.g.settleCrash();
      this.revive();
    };
    this.g.econ.offer(
      {
        kicker: 'crashed',
        name: 'keep going?',
        lines: [free ? 'your free revive today' : `you have ${formatScore(this.g.wallet.cores)} cores`, `score so far ${formatScore(this.g.score)}`],
        yes: free ? 'revive · free' : byAd ? `revive · ${this.g.ads.label()}` : cores,
        yesEnabled: free || byAd || this.g.wallet.cores >= cost,
        alt: byAd ? cores : '',
        altEnabled: this.g.wallet.cores >= cost,
        no: 'no thanks',
        seconds: 6,
      },
      () => {
        if (free) {
          this.g.daily.useFreeRevive(day);
          this.revive();
        } else if (byAd) void this.reviveByAd();
        else byCores();
      },
      () => this.g.settleCrash(),
      byCores,
    );
  }

  /** Revive for a rewarded ad; without one the offer comes back, to try again or turn down. */
  private async reviveByAd(): Promise<void> {
    const ok = await this.watchAd('revive');
    if (this.g.state !== 'crashed' || !this.g.revivePending) return; // moved on meanwhile
    if (ok) this.revive();
    else this.offerRevive();
  }

  /**
   * Earn a reward by ad (at once for premium and on the web). Says why not:
   * no ad loaded in time, or closed early. The offer is the caller's to keep.
   */
  private async watchAd(p: RewardedPlacement): Promise<boolean> {
    const real = this.g.ads.showsAds;
    if (real && !this.g.ads.adReady) this.g.ui.showNotice('loading an ad…');
    if (real) analytics.log('ad_offer_tapped', { placement: PLACEMENT[p] });
    const r = await this.g.ads.watch(p);
    if (real && r !== 'busy') analytics.log(r === 'rewarded' ? 'ad_rewarded' : r === 'skipped' ? 'ad_skipped' : 'ad_unavailable', { placement: PLACEMENT[p] });
    if (r === 'unavailable') this.g.ui.showNotice('no ad available right now. try again in a moment');
    else if (r === 'skipped') this.g.ui.showNotice('ad closed early, so no reward. try again any time');
    return r === 'rewarded';
  }

  /** Double the last run's credits for a rewarded ad (free with premium), once. */
  async doubleCredits(): Promise<void> {
    const n = this.g.lastRunCredits;
    if (n <= 0) return;
    this.g.lastRunCredits = 0;
    this.g.ui.showDouble(null);
    if (!(await this.watchAd('doubleCredits'))) {
      // No reward (the ad didn't load or was closed early): the offer stays, unless another run has ended since.
      if (this.g.lastRunCredits > 0) return;
      this.g.lastRunCredits = n;
      this.g.ui.showDouble(`double +${formatScore(n)} credits · ${this.g.ads.label()}`);
      return;
    }
    this.g.grant({ credits: n });
    this.g.ui.markDoubled(formatScore(n), formatScore(n * 2));
    this.g.ui.showNotice(`doubled: +${formatScore(n * 2)} credits this run · ${formatScore(this.g.wallet.credits)} credits now`);
    this.g.sound.power();
    this.g.title.refreshTitle();
  }

  /** The free daily gift (a rewarded ad, or free with premium). */
  async claimGift(): Promise<void> {
    const day = dayKey(this.g.now());
    if (!this.g.daily.giftReady(day) || !(await this.watchAd('dailyGift')) || !this.g.daily.giftReady(day)) return;
    this.g.daily.takeGift(day);
    const lines = this.g.grant(CONFIG.ads.dailyGift, `gift:${day}`);
    this.g.ui.celebrate([{ kicker: 'free gift', icon: GIFT_ICON, name: 'daily gift', lines }]);
    this.g.title.refreshTitle();
  }

  /** Swap an unfinished daily goal for another (a rewarded ad, or free with premium), once a day. */
  async onReroll(id: string): Promise<void> {
    const i = Number(id.slice(1));
    const day = dayKey(this.g.now());
    if (!/^q\d$/.test(id) || !this.g.daily.canReroll(day) || !(await this.watchAd('rerollQuest')) || !this.g.daily.canReroll(day)) return;
    const q = this.g.daily.reroll(i, day);
    if (q) this.g.ui.showNotice(`new goal: ${questText(q, this.g.title.open('ranked'))}`);
    this.g.goals.renderGoals();
    this.g.title.refreshTitle();
  }

  /** Free revives a day: one for everyone, more with premium. */
  private freeRevivesADay(): number {
    return 1 + (this.g.entitlements.has('premium') ? CONFIG.premium.extraFreeRevives : 0);
  }

  /** Back on the lane with the way ahead cleared, a shield on, and a 3-2-1. */
  private revive(): void {
    const R = CONFIG.economy.revive;
    this.g.revivePending = false;
    this.g.revived = true;
    this.g.preRevive = { score: Math.floor(this.g.score), seconds: this.g.runTime, distance: this.g.world.distance - this.g.runStart };
    this.g.hitThisRun = true;
    this.g.world.revive(R.clearAhead);
    this.g.world.sync();
    this.g.player.reset();
    this.g.player.setVisible(true);
    this.g.trail.setVisible(true);
    this.g.shield = true;
    this.g.player.setShield(true);
    this.g.graceT = R.graceSeconds;
    this.g.stage.shakeX = this.g.stage.shakeY = 0;
    this.g.stage.roll = 0;
    this.g.title.refreshTitle();
    this.g.ui.show(null);
    this.g.ui.showHud(true);
    this.g.startCountdown();
  }
}
