import { insignia, promotionBonus, rankColour, rankName, RANKS } from './ranks';
import { emblem, LEAGUES, leagueName, leaguePar, LP_PER_DIVISION } from './leagues';
import { LOOKS, SLOT_NAMES } from '../ship/looks';
import { TIER_LEAGUE } from '../ship/upgrades';
import { type Celebration, formatScore, type RankResultView } from '../ui/ui';
import { type Game, musicFor, mergeCredits } from '../core/game';

export class RankKeeper {
  constructor(private readonly g: Game) {}

  /** Fold a run into the rank (every mode) and, for ranked, the league; fills the game-over block. Returns bonus credits. */
  recordRank(finished: boolean): number {
    const lg = this.g.leagues;
    const ranked = this.g.mode === 'ranked';
    const score = this.g.assisted ? 0 : this.g.score;
    const target = this.g.weekly.target;
    this.g.beatPar = false;
    const r = this.g.ranked.record(this.g.mode, score, this.g.level, this.g.seed, this.g.now(), ranked ? this.g.weekly.id : undefined);
    const promoted = r.rankAfter > r.rankBefore;
    const leagueLines: string[] = [];
    const party: Celebration[] = [];
    let bonus = r.credits;
    if (ranked) {
      this.g.submitToBoard('ranked', finished);
      this.g.beatPar = score >= leaguePar(lg.league, target);
      this.g.payLeagueWeek(this.g.now()); // a run in a new week: last week's reward first
      const res = lg.record(this.g.score, target, this.g.now());
      bonus += res.credits;
      leagueLines.push(`${leagueName(lg.league, lg.division)} · ${res.lp >= 0 ? '+' : ''}${res.lp} lp (${lg.lp}/${LP_PER_DIVISION})`);
      if (res.divisionUp) {
        leagueLines.push(`division up: +${formatScore(res.credits)} credits`);
        party.push({
          kicker: 'division up',
          icon: emblem(lg.league, lg.division),
          name: leagueName(lg.league, lg.division),
          lines: [`+${formatScore(res.credits)} credits`, `${formatScore(lg.current.weekly[lg.division])} credits a week`],
          color: lg.current.color,
        });
      }
      if (res.divisionDown) leagueLines.push('dropped a division');
      bonus += this.promoteLeague(leagueLines, party);
    }
    if (promoted) {
      const gives: string[] = [];
      for (let k = r.rankBefore + 1; k <= r.rankAfter; k++) gives.push(...this.rankGives(k));
      const newColour = rankColour(r.rankAfter);
      if (newColour !== rankColour(r.rankBefore)) gives.push(`new menu colour: ${newColour.name}`);
      party.unshift({ kicker: 'promoted', icon: insignia(r.rankAfter), name: rankName(r.rankAfter), lines: mergeCredits(gives), color: newColour.accent });
    }
    const lines = [...leagueLines, `+${r.xp} xp${r.doubled ? ' (double)' : ''}`];
    if (ranked) lines.push(`league par this week: ${formatScore(leaguePar(lg.league, target))}`);
    if (promoted) lines.splice(leagueLines.length, 0, `+${formatScore(r.credits)} promotion credits`);
    const view: RankResultView = {
      icon: insignia(r.rankAfter),
      rank: rankName(r.rankAfter),
      promoted,
      xpFraction: this.g.record.xpFraction(),
      lines,
    };
    this.g.ui.setGameOverRank(view);
    if (party.length) this.g.ui.celebrate(party);
    if (promoted) {
      this.g.sound.level(true, musicFor(this.g.level));
      this.g.haptics.level(true);
      if (this.g.state !== 'crashed') this.g.ui.showNotice(`promoted to ${rankName(r.rankAfter)}`);
    }
    return bonus;
  }

  /** Promote to the next league if ready and enough upgrade points are owned. Returns credits. */
  promoteLeague(lines: string[] | null, party: Celebration[] = []): number {
    const lg = this.g.leagues;
    this.g.payLeagueWeek(this.g.now());
    const credits = lg.tryPromote(this.g.upgrades.points(), this.g.now());
    if (credits > 0) {
      party.push({
        kicker: 'new league',
        icon: emblem(lg.league, lg.division),
        name: `${lg.current.name} league`,
        lines: this.leagueGives(lg.league),
        color: lg.current.color,
      });
      const text = `promoted to ${lg.current.name} league: +${formatScore(credits)} credits`;
      if (lines) lines.push(text);
      else this.g.ui.showNotice(text);
      this.g.sound.level(true, musicFor(this.g.level));
      this.g.haptics.level(true);
    } else if (lg.promotionReady && lines) {
      lines.push(`promotion ready: own ${LEAGUES[lg.league + 1].min} upgrade points`);
    }
    return credits;
  }

  /** What reaching rank `k` gives: its promotion credits, any looks, a new insignia. */
  rankGives(k: number): string[] {
    const out = [`+${formatScore(promotionBonus(k))} credits`];
    if (k > 0 && RANKS[k].tier !== RANKS[k - 1].tier) out.push('new insignia');
    for (const l of LOOKS) if (l.unlock.by === 'rank' && l.unlock.rank === k) out.push(`${l.name} ${SLOT_NAMES[l.slot]}`);
    return out;
  }

  /** What reaching league `l` gives. */
  leagueGives(l: number): string[] {
    const x = LEAGUES[l];
    const out: string[] = [];
    if (x.promotion > 0) out.push(`+${formatScore(x.promotion)} credits`);
    for (const look of LOOKS) if (look.unlock.by === 'league' && look.unlock.league === l) out.push(`${look.name} ${SLOT_NAMES[look.slot]}`);
    TIER_LEAGUE.forEach((need, t) => {
      if (need === l && need > 0) out.push(`tier ${t + 1} upgrades`);
    });
    out.push(`up to ${x.max} active upgrade points`);
    out.push(`${formatScore(x.weekly[0])}-${formatScore(x.weekly[2])} credits a week`);
    return out;
  }
}
