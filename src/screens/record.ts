import { CONFIG } from '../core/config';
import { insignia, rankName, RANKS, xpToRank } from '../progression/ranks';
import type { PilotStats } from '../server/backend';
import { ENVIRONMENTS } from '../world/courses';
import { formatScore, type ProgressView } from '../ui/ui';
import type { Game } from '../core/game';

export class RecordScreen {
  constructor(private readonly g: Game) {}

  /** The most recent `n` ranked runs, oldest first. */
  private recentRanked(n: number) {
    return this.g.ranked.history.slice(-n);
  }

  /** Your service record's summary, as others see it when they tap you on a board. */
  pilotStats(): PilotStats {
    const s = this.g.progress.stats;
    return {
      rank: this.g.ranked.rank,
      xp: Math.floor(this.g.ranked.xp),
      runs: s.runs,
      seconds: Math.floor(s.seconds),
      distance: Math.floor(s.distance),
      bestLevel: s.bestLevel,
      bestChain: s.bestChain,
      nearMisses: s.nearMisses,
      pickups: s.pickups,
      rankedRuns: this.g.ranked.history.length,
    };
  }

  /** How far through the current rank's XP band the player is (0..1). */
  xpFraction(): number {
    const i = this.g.ranked.rank;
    if (i >= RANKS.length - 1) return 1;
    const lo = RANKS[i].xp;
    const hi = RANKS[i + 1].xp;
    return Math.max(0, Math.min(1, (this.g.ranked.xp - lo) / (hi - lo)));
  }

  /** The service record: your rank (and the ladder), and your lifetime stats. */
  openRecord(tab: 'rank' | 'stats' = 'rank'): void {
    this.renderStats();
    this.g.ui.setRecordTab(tab);
    const rk = this.g.ranked;
    const i = rk.rank;
    const next = RANKS[i + 1];
    const xpLeft = next ? xpToRank(rk.xp, i + 1) : 0;
    const checks: ProgressView['checks'] = [];
    if (next) {
      checks.push({ label: `${formatScore(next.xp)} xp`, value: `${formatScore(rk.xp)} now`, met: xpLeft === 0 });
    }
    const big = formatScore(next ? xpLeft : rk.xp);
    const goal = next ? `xp to ${rankName(i + 1)}` : 'xp. top rank reached';

    const recent = this.recentRanked(20);
    const xpSum = recent.reduce((t, h) => t + h.xp, 0);
    const avg = recent.length ? Math.round(xpSum / recent.length) : 0;
    const runsToGo = avg > 0 ? Math.ceil(xpLeft / avg) : 0;
    const b = rk.bests(this.g.now());

    this.g.ui.renderProgress('record', {
      icon: insignia(i),
      name: rankName(i),
      big,
      goal,
      fraction: this.xpFraction(),
      detail: next
        ? `${formatScore(rk.xp - RANKS[i].xp)} / ${formatScore(next.xp - RANKS[i].xp)} xp this rank${runsToGo ? ` · about ${runsToGo} run${runsToGo === 1 ? '' : 's'}` : ''}`
        : 'general grade 4: the top',
      checks,
      gives: next ? [{ title: `${rankName(i + 1)} gives`, items: this.g.ranks.rankGives(i + 1) }] : [],
      trend: {
        title: recent.length ? `last ${recent.length} runs` : 'recent runs',
        values: recent.map((h) => h.xp),
        summary: recent.length ? `+${formatScore(xpSum)} xp · avg ${avg}` : '',
        unit: 'xp',
      },
      rows: [
        ['xp in ranked', `1 per ${formatScore(CONFIG.rank.rankedPointsPerXp)} points`],
        ['xp in other modes', `1 per ${formatScore(CONFIG.rank.pointsPerXp)} points`],
        ['xp for a goal', String(CONFIG.rank.goalXp)],
        ['double xp runs left today', String(rk.bonusRunsLeft(this.g.now()))],
        ['best this week', formatScore(b.week)],
        ['best ever', formatScore(b.all)],
        ['ranked runs', formatScore(rk.history.length)],
      ],
      ladder: RANKS.map((r, k) => ({
        icon: insignia(k),
        name: rankName(k),
        needs: `${formatScore(r.xp)} xp`,
        gives: k === 0 ? '' : this.g.ranks.rankGives(k).join(' · '),
        state: k < i ? 'done' : k === i ? 'current' : 'locked',
      })),
    });
    this.g.openInfo('record');
  }

  private renderStats(): void {
    const s = this.g.progress.stats;
    const hours = Math.floor(s.seconds / 3600);
    const mins = Math.floor((s.seconds % 3600) / 60);
    const worst = this.g.progress.worstPlace();
    this.g.ui.renderStats([
      ['runs', formatScore(s.runs)],
      ['time played', hours > 0 ? `${hours}h ${mins}m` : `${mins}m`],
      ['distance', `${(s.distance / 1000).toFixed(1)} km`],
      ['best this week (ranked)', formatScore(this.g.progress.weeklyBest(this.g.weekly.id))],
      ['best today (daily)', formatScore(this.g.challenge.bestOn(this.g.today.day))],
      ['daily streak', `${this.g.challenge.streakOn(this.g.today.day)} (longest ${this.g.challenge.longest})`],
      ['best endless', formatScore(this.g.progress.endlessBest)],
      ...ENVIRONMENTS.map((e): [string, string] => [`best solo: ${e.name}`, formatScore(this.g.progress.envBest[e.id] ?? 0)]),
      ['furthest level', String(s.bestLevel || 1)],
      ['best chain', `x${s.bestChain}`],
      ['near misses', formatScore(s.nearMisses)],
      ['pickups', formatScore(s.pickups)],
      ['crash most in', worst ? `${worst} (${s.crashes[worst]})` : '-'],
    ]);
  }
}
