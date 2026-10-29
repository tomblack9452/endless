import { CONFIG } from '../core/config';
import { insignia, rankName } from '../progression/ranks';
import { type Quest, questText } from '../economy/daily';
import type { GoalsTab, TaskRow } from '../ui/goalsView';
import { type Reward, rewardParts } from '../economy/reward';
import { dayKey, formatWait, untilTomorrow } from '../economy/time';
import { weekKey } from '../progression/leagues';
import { ACHIEVEMENTS, type Achievement, GROUP_NAMES, type Group, achievement, progressOn, rewardKeys } from '../progression/achievements';
import { byKey, type LookItem, SLOT_NAMES } from '../ship/looks';
import { formatScore } from '../ui/ui';
import { type Game, GOAL_ICON, mergeCredits } from '../core/game';

export class GoalScreens {
  constructor(private readonly g: Game) {}

  /** Add pass XP from anywhere (a claimed goal); pays any tiers reached. Returns lines. */
  private passXp(xp: number): string[] {
    const before = this.g.pass.tier;
    const paid = this.g.pass.addXp(this.g.now(), xp);
    const lines = [`+${formatScore(xp)} pass xp`];
    for (const r of paid) lines.push(...this.g.grant(r));
    if (this.g.pass.tier > before) lines.push(`season pass tier ${this.g.pass.tier}`);
    return lines;
  }

  /** What finishing a goal gives, in words. */
  goalRewardText(a: Achievement): string {
    const looks = rewardKeys(a.id)
      .map((k) => byKey(k))
      .filter((l): l is LookItem => !!l);
    return [`+${a.credits.toLocaleString('en-US')} credits`, ...looks.map((l) => `${l.name} ${SLOT_NAMES[l.slot]}`)].join(' · ');
  }

  /** The goals screen's three tabs. */
  renderGoals(): void {
    const now = this.g.now();
    const day = dayKey(now);
    this.g.daily.turn(day);
    this.g.weeklyGoals.turn(weekKey(now));
    // Daily: the login calendar and today's goals.
    const due = this.g.daily.loginDue(day);
    const step = this.g.daily.loginStep;
    const login = CONFIG.economy.login as readonly Reward[];
    const claimedUpTo = due >= 0 ? step : step === 0 ? login.length : step;
    const Q = CONFIG.economy.quests;
    const W = CONFIG.economy.weekly;
    const taskRows = (list: readonly Quest[], prefix: string, passXp: number): TaskRow[] =>
      list.map((q, i) => ({
        id: `${prefix}${i}`,
        name: questText(q, this.g.title.open('ranked')),
        progress: `${formatScore(q.progress)} / ${formatScore(q.target)}`,
        fraction: q.progress / q.target,
        reward: `+${formatScore(q.credits)} credits · +${formatScore(passXp)} pass xp`,
        state: q.claimed ? 'claimed' : q.done ? 'claim' : 'open',
      }));
    const bonusRow = (id: string, name: string, cores: number, ready: boolean, claimed: boolean, list: readonly Quest[]): TaskRow => ({
      id,
      name,
      progress: `${list.filter((q) => q.claimed).length} / ${list.length}`,
      fraction: list.filter((q) => q.claimed).length / Math.max(1, list.length),
      reward: `+${cores} cores`,
      state: claimed ? 'claimed' : ready ? 'claim' : 'open',
    });
    const qs = this.g.daily.quests;
    this.g.goalsUi.renderDaily({
      calendar: login.map((r, i) => ({
        day: i + 1,
        reward: rewardParts(r)
          .map((p) => p.replace(/^\+/, ''))
          .join(', '),
        state: i < claimedUpTo ? 'claimed' : i === step && due >= 0 ? 'today' : 'next',
      })),
      claim: due >= 0 ? { text: `claim day ${step + 1}`, enabled: true } : { text: `next reward in ${formatWait(untilTomorrow(now))}`, enabled: false },
      reset: `new in ${formatWait(untilTomorrow(now))}`,
      rows: [
        ...taskRows(qs, 'q', Q.passXp).map((r) =>
          r.state === 'open' && this.g.daily.canReroll(day) && this.g.ads.offers('rerollQuest')
            ? { ...r, reroll: `swap for another goal · ${this.g.ads.label()}` }
            : r,
        ),
        bonusRow('qall', 'claim all three', Q.allDoneCores, this.g.daily.bonusReady, this.g.daily.bonusClaimed, qs),
      ],
    });
    // Weekly.
    const wg = this.g.weeklyGoals.goals;
    const weekEnd = Date.parse(`${weekKey(now)}T00:00:00Z`) + 7 * 86_400_000;
    this.g.goalsUi.renderWeekly(`new in ${formatWait(weekEnd - now)}`, [
      ...taskRows(wg, 'w', W.passXp),
      bonusRow('wall', 'claim all five', W.allDoneCores, this.g.weeklyGoals.bonusReady, this.g.weeklyGoals.bonusClaimed, wg),
    ]);
    // Achievements.
    const snap = this.g.snapshot();
    const groups = (Object.keys(GROUP_NAMES) as Group[]).map((g) => ({
      name: GROUP_NAMES[g],
      rows: ACHIEVEMENTS.filter((a) => a.group === g).map((a): TaskRow => {
        const p = progressOn(a, snap);
        const claimed = this.g.goalLog.has(a.id);
        return {
          id: `a:${a.id}`,
          name: a.name,
          text: a.text,
          progress: `${formatScore(p.have)} / ${formatScore(p.target)}`,
          fraction: p.have / p.target,
          reward: `${this.goalRewardText(a)} · +${CONFIG.rank.goalXp} xp`,
          state: claimed ? 'claimed' : p.done ? 'claim' : 'open',
        };
      }),
    }));
    const doneCount = ACHIEVEMENTS.filter((a) => progressOn(a, snap).done).length;
    this.g.goalsUi.renderAchievements(
      `${doneCount} of ${ACHIEVEMENTS.length} done. each pays credits and rank xp, and unlocks a look to wear. they count everything you've done, from the start.`,
      groups,
    );
    this.g.goalsUi.setTabNews({
      daily: due >= 0 || this.g.daily.claimable > 0,
      weekly: this.g.weeklyGoals.claimable > 0,
      achievements: this.achievementsToClaim() > 0,
    });
  }

  /** Finished achievements not yet claimed. */
  private achievementsToClaim(): number {
    const snap = this.g.snapshot();
    return ACHIEVEMENTS.filter((a) => !this.g.goalLog.has(a.id) && progressOn(a, snap).done).length;
  }

  /** Everything waiting to be claimed on the goals screen (the bar's dot). */
  goalsToClaim(): number {
    return this.g.daily.claimable + this.g.weeklyGoals.claimable + this.achievementsToClaim();
  }

  /** Claim a finished goal ("q1", "qall", "w3", "wall", "a:<id>"): pay it, with a small moment. */
  onClaim(id: string): void {
    let lines: string[] = [];
    let name = '';
    if (/^q\d$/.test(id)) {
      const q = this.g.daily.claim(Number(id.slice(1)));
      if (!q) return;
      name = questText(q, this.g.title.open('ranked'));
      lines = [...this.g.grant({ credits: q.credits }), ...this.passXp(CONFIG.economy.quests.passXp)];
    } else if (/^w\d$/.test(id)) {
      const q = this.g.weeklyGoals.claim(Number(id.slice(1)));
      if (!q) return;
      name = questText(q, this.g.title.open('ranked'));
      lines = [...this.g.grant({ credits: q.credits }), ...this.passXp(CONFIG.economy.weekly.passXp)];
    } else if (id === 'qall' || id === 'wall') {
      // Named for the day or week the goals belong to (not the clock now: it may have turned since), so the server pays it once.
      const source = id === 'qall' ? `goals:${this.g.daily.day}` : `weekly:${this.g.weeklyGoals.week}`;
      const cores = id === 'qall' ? this.g.daily.claimBonus() : this.g.weeklyGoals.claimBonus();
      if (cores <= 0) return;
      this.g.ui.celebrate([
        { kicker: id === 'qall' ? "today's goals" : "this week's goals", icon: GOAL_ICON, name: 'all done', lines: this.g.grant({ cores }, source) },
      ]);
    } else if (id.startsWith('a:')) {
      const a = achievement(id.slice(2));
      if (!a || this.g.goalLog.has(a.id) || !progressOn(a, this.g.snapshot()).done) return;
      this.g.goalLog.add(a.id);
      this.g.goalLog.save();
      name = a.name;
      const promo = this.g.ranked.addXp(CONFIG.rank.goalXp);
      lines = [...this.g.grant({ credits: a.credits + promo.credits }), `+${CONFIG.rank.goalXp} xp`];
      if (promo.rankAfter > promo.rankBefore) {
        this.g.ui.celebrate([
          {
            kicker: 'promoted',
            icon: insignia(promo.rankAfter),
            name: rankName(promo.rankAfter),
            lines: mergeCredits(Array.from({ length: promo.rankAfter - promo.rankBefore }, (_, k) => this.g.ranks.rankGives(promo.rankBefore + 1 + k)).flat()),
            color: '#d4a63a',
          },
        ]);
      }
    } else return;
    if (name) this.g.ui.showNotice(`${name}: ${mergeCredits(lines).join(' · ')}`);
    this.g.sound.pickup();
    this.g.haptics.pickup();
    this.renderGoals();
    this.g.title.refreshTitle();
  }

  openGoals(tab: GoalsTab = this.g.goalsTab): void {
    this.g.goalsTab = tab;
    this.g.goalsUi.setTab(tab);
    this.renderGoals();
    this.g.openInfo('goals');
  }
}
