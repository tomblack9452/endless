import { CONFIG } from '../core/config';
import { type Feature, isOpen, nextStageText, STAGES, stageFor } from '../progression/reveal';
import { insignia, RANK_COLOURS, rankColour, rankName, RANKS, xpToRank } from '../progression/ranks';
import { dayKey, formatWait, untilTomorrow } from '../economy/time';
import { storage } from '../core/storage';
import { emblem, leagueName, LP_PER_DIVISION } from '../progression/leagues';
import { formatScore, type TitleCard } from '../ui/ui';
import type { Game } from '../core/game';
import GOAL_ICON from '../assets/icons/goal.svg?raw';
import { REVEAL_KEY } from '../progression/reveal';
import { type HubMode, hubMode, LAST_MODE_KEY, LAST_SOLO_KEY } from '../ui/hubMode';
import { ENVIRONMENTS } from '../world/courses';

/** Your place on this week's league board, as the server last said it. */
const LEAGUE_PLACE_KEY = 'endless.leaguePlace';

export class TitleScreen {
  constructor(private readonly g: Game) {
    void storage.get(LAST_MODE_KEY).then((v) => (this.saved = v));
    void storage.get(LAST_SOLO_KEY).then((v) => (this.lastSolo = Number(v) || 0));
    void storage.get(LEAGUE_PLACE_KEY).then((v) => {
      try {
        if (v) this.place = JSON.parse(v);
      } catch {
        // Unreadable: no place yet.
      }
    });
  }

  private saved: string | null = null;
  private lastSolo = 0;
  private place: { week: string; rank: number } | null = null;

  /** The mode the big button flies now. */
  get mode(): HubMode {
    return hubMode(this.saved, (m) => this.open(m === 'zen' || m === 'endless' ? 'ranked' : m));
  }

  /** A chip: pick its mode. Solo picked again opens the areas to choose another. */
  pickMode(m: string): void {
    if (m === 'solo' && this.mode === 'solo') {
      this.g.nav.onTitleLink('solo');
      return;
    }
    this.saved = m;
    void storage.set(LAST_MODE_KEY, m);
    this.g.haptics.pickup();
    this.refreshTitle();
  }

  /** The solo area flown last, for the big button. */
  noteSolo(index: number): void {
    this.lastSolo = index;
    void storage.set(LAST_SOLO_KEY, String(index));
  }

  /** The league board's place for this week (from a ranked run's result or the board). */
  notePlace(rank: number): void {
    this.place = { week: this.g.weekly.id, rank };
    void storage.set(LEAGUE_PLACE_KEY, JSON.stringify(this.place));
  }

  /** The solo area the big button flies: the last one, if it's still open, else the first. */
  private soloIndex(): number {
    const e = ENVIRONMENTS[this.lastSolo];
    return e && this.g.solo.envOpen(e) ? this.lastSolo : 0;
  }

  /** How much of the game is open to this player (new players see it in stages: reveal.ts). */
  private revealStage(): number {
    return stageFor(this.g.progress.stats.validRuns, this.g.onboarding.done);
  }

  open(f: Feature): boolean {
    return this.g.allOpen || isOpen(f, this.revealStage());
  }

  /** The big button: the mode on show. */
  startPrimary(): void {
    const m = this.mode;
    if (m === 'ranked') this.g.startRanked();
    else if (m === 'solo') this.g.startSolo(this.soloIndex());
    else if (m === 'daily') this.g.courseRuns.startDaily();
    else if (m === 'zen') this.g.startZen();
    else this.g.startEndless();
  }

  /** The big button's name and the line under it, for the mode on show. */
  private primary(now: number): [string, string] {
    const best = (n: number, rest: string) => (n > 0 ? `best ${formatScore(n)}${rest ? ` · ${rest}` : ''}` : rest);
    switch (this.mode) {
      case 'ranked': {
        const lg = this.g.leagues;
        const place = this.place?.week === this.g.weekly.id ? `#${this.place.rank} in ` : '';
        const league = `${place}${leagueName(lg.league, lg.division)}`;
        const wb = this.g.progress.weeklyBest(this.g.weekly.id);
        return ['ranked', wb > 0 ? `this week ${formatScore(wb)} · ${league}` : `the same run for everyone · ${league}`];
      }
      case 'solo': {
        const e = ENVIRONMENTS[this.soloIndex()];
        return ['solo', best(this.g.progress.envBest[e.id] ?? 0, e.name)];
      }
      case 'daily': {
        const b = this.g.challenge.bestOn(this.g.today.day);
        return ['daily', `${b > 0 ? `today ${formatScore(b)}` : 'a new course'} · ${formatWait(untilTomorrow(now))} left`];
      }
      case 'zen':
        return ['zen', 'just fly: no score, crashes fade'];
      default:
        return ['endless', this.g.progress.endlessBest > 0 ? `best ${formatScore(this.g.progress.endlessBest)}` : 'every area in turn'];
    }
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
    if (this.g.daily.giftReady(day) && this.g.ads.offers('dailyGift')) {
      cards.push({ id: 'gift', kicker: 'free gift', title: this.g.ads.label(), hot: true });
      this.g.revives.adShown('dailyGift');
    }
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
    const store = this.g.offers.card(now);
    if (store) cards.push(store);
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
    const now = this.g.now();
    const runs = this.g.progress.stats.validRuns;
    const [name, sub] = this.primary(now);
    this.g.ui.setPrimary(name, sub);
    this.g.ui.setModeChip(this.mode);
    this.g.ui.setFeatures((f) =>
      f === 'endless' || f === 'zen' || f === 'league' || f === 'ranked'
        ? this.open('ranked')
        : f === 'boards'
          ? this.open('leaderboard')
          : f === 'solo' || f === 'shop' || f === 'record' || f === 'daily'
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
