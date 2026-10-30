import { CONFIG } from './config';
import { analytics } from '../platform/analytics';
import { exitChoice } from '../platform/exit';
import { sendFeedback } from '../platform/feedback';
import { cancelOpenReport } from '../ui/report';
import { type Feature, nextStageText } from '../progression/reveal';
import type { Game } from './game';

export class Navigation {
  constructor(private readonly g: Game) {}

  /** The "close endless space?" dialog is up. */
  exitAsking = false;

  onTitleLink = (name: string): void => {
    // Every way in to a part of the game that isn't open yet says when it opens (the cores chip, cards...).
    const needs: Record<string, Feature> = {
      solo: 'solo',
      record: 'record',
      shop: 'shop',
      'shop-cores': 'shop',
      pass: 'shop',
      boards: 'leaderboard',
      challenge: 'daily',
    };
    const f = needs[name];
    if (f && !this.g.title.open(f)) {
      this.g.ui.showNotice(nextStageText(this.g.progress.stats.validRuns, this.g.onboarding.done) || 'not open yet');
      return;
    }
    if (name === 'endless') this.g.startEndless();
    else if (name === 'zen') this.g.startZen();
    else if (name === 'challenge') this.g.courseRuns.startDaily();
    else if (name === 'solo') this.g.solo.openSolo();
    else if (name === 'record') this.g.record.openRecord();
    else if (name === 'goals') this.g.goals.openGoals();
    else if (name === 'hangar') this.g.hangarScreen.openHangar();
    else if (name === 'shop') {
      this.g.shopPick = -1;
      this.g.preview = null;
      this.g.shop.openShop();
    } else if (name === 'shop-cores') this.g.shop.openStore(null, 'wallet');
    else if (name === 'pass') this.g.shop.openPass(null);
    else if (name === 'boards') this.g.boards.openBoards();
    else if (name === 'daily') this.g.goals.openGoals('daily');
    else if (name === 'claim') this.g.claimLogin();
    else if (name === 'gift') void this.g.revives.claimGift();
  };

  /**
   * The Android back button (and Escape): close what's open, pause a run. At the top (the title or
   * welcome screen) it asks before closing, or returns false to leave the app (see exit.ts).
   */
  back(): boolean {
    if (this.exitAsking) this.closeExitAsk();
    else if (this.g.ui.celebrating) this.g.ui.skipCelebration();
    else if (this.g.econ.offerOpen && !(this.g.state === 'crashed' && this.g.revivePending))
      this.g.econ.declineOffer(); // the reminders offer: no thanks
    else if (cancelOpenReport()) return true;
    else if (this.g.ui.guideOpen) this.g.firstLaunch.closeGuide();
    else if (this.g.settingsOpen) this.g.settingsScreen.closeSettings();
    else if (this.g.infoOpen === 'welcome') return this.backAtTop();
    else if (this.g.infoOpen) this.closeInfo();
    else if (this.g.state === 'playing' || this.g.state === 'countdown') this.g.pause();
    else if (this.g.state === 'paused') this.g.resume();
    else if (this.g.state === 'crashed' && this.g.revivePending) this.declineRevive();
    else if (this.g.state === 'crashed' || this.g.state === 'finished') this.toMainMenu();
    else return this.backAtTop();
    return true;
  }

  /** Back with nothing left to close: ask first (true), or false to leave (Android) or do nothing (web). */
  private backAtTop(): boolean {
    if (exitChoice({ native: this.g.native, ask: this.g.settings.confirmExit, asking: this.exitAsking }) !== 'ask') return false;
    this.exitAsking = true;
    this.g.econ.offer(
      { kicker: '', name: 'close endless space?', lines: ['your progress is saved'], yes: 'close', yesEnabled: true, no: 'stay', seconds: 0 },
      () => {
        this.exitAsking = false;
        void import('@capacitor/app').then(({ App }) => App.exitApp());
      },
      () => (this.exitAsking = false),
    );
    return true;
  }

  /** "stay" (or back again while the dialog shows). */
  private closeExitAsk(): void {
    this.exitAsking = false;
    this.g.econ.dismissOffer();
  }

  /** Back on the revive offer (or before it shows): no thanks, and the game-over screen. */
  private declineRevive(): void {
    this.g.econ.dismissOffer();
    this.g.reviveAsked = true;
    this.g.settleCrash();
  }

  onKey = (e: KeyboardEvent): void => {
    if (e.repeat || (e.target as HTMLElement | null)?.tagName === 'INPUT') return; // typing a name is not a shortcut
    if ((e.code === 'Space' || e.code === 'Enter') && this.g.state !== 'paused') {
      if (this.g.state === 'title' && !this.g.settingsOpen && !this.g.infoOpen) this.g.title.startPrimary();
      else this.g.onTap();
    } else if (e.code === 'Escape')
      this.back(); // what Android's back button does
    else if (e.code === 'KeyP') {
      if (this.g.settingsOpen) this.g.settingsScreen.closeSettings();
      else if (this.g.infoOpen) this.closeInfo();
      else if (this.g.state === 'playing') this.g.pause();
      else if (this.g.state === 'paused') this.g.resume();
    }
  };

  onPauseButton = (e: PointerEvent): void => {
    e.stopPropagation();
    this.g.pause();
  };

  onMenu = (action: string): void => {
    if (action === 'resume') this.g.resume();
    else if (action === 'settings') this.g.settingsScreen.openSettings();
    else if (action === 'delete') void this.g.account.deleteAccount();
    else if (action === 'google') void this.g.account.keepWithGoogle(false);
    else if (action === 'google-welcome') void this.g.account.keepWithGoogle(true);
    else if (action === 'privacy-choices') void this.g.ads.privacyChoices().then(() => analytics.setConsent(this.g.ads.consented));
    else if (action === 'feedback') void sendFeedback(this.g.settingsScreen.feedbackScreen());
    else if (action === 'name-later' && this.g.infoOpen === 'name') this.closeInfo();
    else if (action === 'tips') {
      this.g.hints.replay();
      this.g.ui.showNotice('tips are back for your next runs');
    } else if (action === 'tutorial') {
      if (this.g.state !== 'title') this.toMainMenu();
      this.g.onboarding.go('replay');
      this.g.feelUsed = null;
      this.g.settingsScreen.closeSettings();
      this.g.firstLaunch.openWelcome();
    } else if (action === 'guide') this.g.ui.showGuide('got it');
    else if (action === 'whats-new') this.g.settingsScreen.showWhatsNew();
    else if (action === 'menu') {
      const practising = this.g.practice;
      // From the end screen, a due interstitial shows first (not from the pause menu).
      if (!practising && (this.g.state === 'crashed' || this.g.state === 'finished')) return this.g.leaveResults(() => this.toMainMenu());
      this.toMainMenu();
      if (practising) {
        // Left the practice run: back to the start of onboarding (a trial: back to "how did that feel?").
        if (practising.kind === 'trial') this.g.feelUsed = practising.control;
        this.g.onboarding.go('quit');
        this.g.firstLaunch.openWelcome();
      }
    } else if (action === 'share') void this.g.connection.share();
    else if (action === 'details') this.g.ui.showDetails(!this.g.ui.detailsOpen);
    else if (action === 'double') void this.g.revives.doubleCredits();
    else if (action === 'next') this.g.results.onNext();
    else if (action === 'back') {
      if (this.g.infoOpen) this.closeInfo();
      else this.g.settingsScreen.closeSettings();
    }
  };

  private closeInfo(): void {
    if (this.g.infoOpen === 'hangar' && this.g.hangarFrom === 'shop') {
      // Back to the shop it was opened from, not all the way out.
      this.g.hangarFrom = null;
      this.g.preview = null;
      this.g.applyLooks();
      this.g.shop.openShop();
      return;
    }
    if (this.g.infoOpen === 'store' && this.g.storeFrom === 'shop') {
      this.g.storeFrom = null;
      this.g.shop.openShop();
      return;
    }
    if (this.g.infoOpen === 'pass' && this.g.passFrom === 'store') {
      this.g.passFrom = null;
      this.g.shop.openStore();
      return;
    }
    if (this.g.infoOpen === 'hangar' || this.g.infoOpen === 'shop') {
      // Leaving the hangar takes off anything only being tried on.
      this.g.preview = null;
      this.g.applyLooks();
    }
    if (this.g.infoOpen === 'name') {
      // Later (no signal, or no name in mind): asked again next time the game starts, not after every run.
      this.g.nameLater = true;
    } else if (this.g.infoOpen === 'welcome') return; // it ends by its own buttons
    if (this.g.infoOpen === 'boards') this.g.portraits.release(); // its pictures stay cached; the renderer goes
    if (this.g.state === 'title') {
      // The ship only shows on the screens that show it off (hangar, shop, welcome).
      this.g.player.setVisible(false);
      this.g.trail.setVisible(false);
    }
    this.g.infoOpen = null;
    this.g.ui.show('title');
  }

  /** Abandon the run and go back to the live title scene. Best score still counts. */
  toMainMenu(): void {
    this.g.ui.showQuickRetry(null);
    if (this.g.state === 'paused') {
      // Abandoned mid-run: it still counts, for its best and the stats.
      if (!this.g.recorded) this.g.recordBest(false);
      this.g.finishRun(null);
    }
    // Left with a revive still on offer: the run ends as it stood, rather than not at all.
    if (this.g.state === 'crashed' && this.g.revivePending) this.g.settleCrash();
    if (this.g.practice) {
      this.g.practice = null;
      this.g.teach.show(false);
    }
    this.g.econ.setCountdown(0);
    this.g.econ.dismissOffer();
    this.g.ghost.stop();
    this.g.rival.stop();
    this.g.zen = false;
    this.g.ui.setZen(false);

    this.g.state = 'title';
    this.g.input.enabled = false;
    this.g.input.releaseAll();
    this.g.boosting = false;
    this.g.boostLevel = 0;
    this.g.powers.endPowers();
    this.g.chain = 0;
    this.g.speed = CONFIG.speed.titleDrift;
    this.g.stage.pullBack = this.g.stage.drop = 0;
    this.g.stage.shakeX = this.g.stage.shakeY = 0;
    this.g.speedLines.update(0, 0, 0);
    this.g.player.reset(); // clears any crash pieces or fall
    this.g.player.setVisible(false);
    this.g.trail.setVisible(false);
    this.g.events.clear();
    this.g.sound.setWind(0);
    this.g.applyLooks();
    this.g.world.reset(0, false);
    this.g.level = 1;
    this.g.applyLook(0);
    this.g.sound.toTitle();
    this.g.ui.hideCombo();
    this.g.ui.hideBanner();
    this.g.ui.showHud(false);
    this.g.ui.show('title');
    this.g.title.refreshTitle();
    this.g.lastTime = performance.now();
    void this.g.account.askName();
  }
}
