import { CONFIG } from '../core/config';
import { type Feature, isOpen, nextStageText, STAGES, stageFor } from '../progression/reveal';
import { insignia, RANK_COLOURS, rankColour, rankName, RANKS, xpToRank } from '../progression/ranks';
import { dayKey, formatWait, untilTomorrow } from '../economy/time';
import { storage } from '../core/storage';
import { emblem, leagueName, LP_PER_DIVISION } from '../progression/leagues';
import { formatScore, type TitleCard } from '../ui/ui';
import { type Game, REVEAL_KEY, GOAL_ICON } from '../core/game';

export class TitleScreen {
  constructor(private readonly g: Game) {}

  /** How much of the game is open to this player (new players see it in stages: reveal.ts). */
  private revealStage(): number {
    return stageFor(this.g.progress.stats.validRuns, this.g.onboarding.done);
  }

  open(f: Feature): boolean {
    return this.g.allOpen || isOpen(f, this.revealStage());
  }

  /** The big button: ranked once it's open, endless before. */
  startPrimary(): void {
    if (this.open('ranked')) this.g.startRanked();
    else this.g.startEndless();
  }

  /** Say so, once, when a new part of the game opens. */
  private announceReveal(): void {
    if (this.g.revealSeen === null) return; // not read yet
    const stage = this.revealStage();
    if (stage <= this.g.revealSeen) return;
    // A save from before the stages (or the first look at an old save): open, without a fanfare.
    const quiet = (this.g.revealSeen < 0 && stage === STAGES.length) || stage === 0;
    if (!quiet) {
      const lines = STAGES.slice(Math.max(0, this.g.revealSeen), stage).map((s) => s.text);
      this.g.ui.celebrate([{ kicker: 'new', icon: GOAL_ICON, name: 'more to play', lines }]);
    }
    this.g.revealSeen = stage;
    void storage.set(REVEAL_KEY, String(stage));
  }

  /** The live cards above the big button: the pass, today's goals, a reward waiting. */
  titleCards(now: number): TitleCard[] {
    const cards: TitleCard[] = [];
    const day = dayKey(now);
    const due = this.g.daily.loginDue(day);
    if (due >= 0) cards.push({ id: 'claim', kicker: 'daily reward', title: `day ${due + 1} ready to claim`, hot: true });
    if (this.g.daily.giftReady(day) && this.g.ads.offers('dailyGift')) cards.push({ id: 'gift', kicker: 'free gift', title: this.g.ads.label(), hot: true });
    if (this.open('daily')) {
      // Today's challenge: your best (or a new course), the time left, the streak in the kicker.
      const best = this.g.challenge.bestOn(this.g.today.day);
      const streak = this.g.challenge.streakOn(this.g.today.day);
      cards.push({
        id: 'challenge',
        kicker: streak > 0 ? `daily · ${streak} day${streak === 1 ? '' : 's'}` : 'daily challenge',
        title: best > 0 ? `best ${formatScore(best)}` : 'new course',
        sub: `${formatWait(untilTomorrow(now))} left`,
        hot: !this.g.challenge.playedOn(this.g.today.day),
      });
    }
    const quests = this.g.daily.quests;
    const done = quests.filter((q) => q.done).length;
    const toClaim = this.g.goals.goalsToClaim();
    cards.push({
      id: 'daily',
      kicker: "today's goals",
      title: toClaim > 0 ? `${toClaim} to claim` : done >= quests.length ? 'all done' : `${done} of ${quests.length} done`,
      fraction: quests.length ? done / quests.length : 0,
      hot: toClaim > 0,
    });
    const P = CONFIG.economy.pass;
    const tier = this.g.pass.tier;
    cards.push({
      id: 'pass',
      kicker: `pass · tier ${tier}`,
      title: tier >= P.tiers ? 'complete' : `${formatScore(P.xpPerTier - (this.g.pass.xp % P.xpPerTier))} xp to go`,
      fraction: this.g.pass.tierFraction,
    });
    return cards;
  }

  refreshTitle(): void {
    const colour = rankColour(this.g.ranked.rank);
    const dark = this.g.settings.dark;
    this.g.ui.setAccent(
      this.g.settings.contrast ? (dark ? '#ffffff' : '#2b2824') : dark ? colour.dark : colour.accent,
      !this.g.settings.contrast && colour === RANK_COLOURS[RANK_COLOURS.length - 1],
    );
    const i = this.g.ranked.rank;
    this.g.applyLooks(); // the wing decal follows your rank and league
    const lg = this.g.leagues;
    this.g.ui.setTitleLeague(emblem(lg.league, lg.division), `${leagueName(lg.league, lg.division)} · ${lg.lp} lp`, lg.lp / LP_PER_DIVISION);
    const next = RANKS[i + 1];
    this.g.ui.setTitleRank(insignia(i), rankName(i), next ? `${formatScore(xpToRank(this.g.ranked.xp, i + 1))} xp to ${rankName(i + 1)}` : 'the top rank');
    const wb = this.g.progress.weeklyBest(this.g.weekly.id);
    const now = this.g.now();
    const runs = this.g.progress.stats.validRuns;
    if (this.open('ranked')) this.g.ui.setPrimary('ranked', wb > 0 ? `your best this week ${formatScore(wb)}` : 'the same run for everyone, all week');
    else
      this.g.ui.setPrimary(
        'fly',
        this.g.progress.endlessBest > 0 ? `endless · best ${formatScore(this.g.progress.endlessBest)}` : 'endless: every area in turn',
      );
    this.g.ui.setFeatures((f) =>
      f === 'endless' || f === 'zen' || f === 'league'
        ? this.open('ranked')
        : f === 'boards'
          ? this.open('leaderboard')
          : f === 'solo' || f === 'shop' || f === 'record'
            ? this.open(f)
            : true,
    );
    this.g.ui.setTitleNext(this.g.allOpen ? '' : nextStageText(runs, this.g.onboarding.done));
    this.g.ui.renderTitleCards(this.titleCards(now));
    this.g.refreshBar(now);
    this.announceReveal();
    this.g.cloud.push(); // most changes end here: keep the cloud save current
  }
}
