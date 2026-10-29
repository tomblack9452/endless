import { describeShip, type ShipLook } from '../ship/portrait';
import { insignia, rankName, RANKS } from '../progression/ranks';
import type { BoardId, ReportReason, SubmitResult } from '../server/backend';
import { BOARD_TABS, boardCaption, boardName, boardQuery } from '../server/boards';
import { ENVIRONMENTS } from '../world/courses';
import { DIVISIONS, divisionReward, emblem, LEAGUES, leagueName, leaguePar, LP_PER_DIVISION } from '../progression/leagues';
import { formatScore, type PilotCardView, type ProgressView } from '../ui/ui';
import type { Game } from '../core/game';
import { GENERATED_NAME } from './account';

export class BoardScreens {
  constructor(private readonly g: Game) {}

  private boardSeq = 0;

  openLeague(): void {
    const lg = this.g.leagues;
    const l = lg.league;
    const next = LEAGUES[l + 1];
    const owned = this.g.upgrades.points();
    const target = this.g.weekly.target;
    const lastDivision = DIVISIONS.length - 1;
    const parNow = leaguePar(l, target);
    const left = Math.max(0, LP_PER_DIVISION - lg.lp);

    let big = String(left);
    let goal: string;
    const checks: ProgressView['checks'] = [];
    if (lg.top) {
      big = String(lg.lp);
      goal = 'lp in the top league';
    } else if (lg.division < lastDivision) {
      goal = `lp to ${leagueName(l, lg.division + 1)}`;
      checks.push({ label: `own ${next.min} upgrade points for ${next.name}`, value: `${owned} owned`, met: owned >= next.min });
    } else {
      goal = lg.promotionReady ? `division full: ${next.name} next` : `lp to finish ${leagueName(l, lg.division)}`;
      checks.push({ label: `fill division ${DIVISIONS[lastDivision]}`, value: `${lg.lp}/${LP_PER_DIVISION} lp`, met: lg.promotionReady });
      checks.push({ label: `own ${next.min} upgrade points`, value: `${owned} owned`, met: owned >= next.min });
    }
    // Roughly how many runs at par that is (+10 LP each).
    const runs = Math.ceil(left / 10);

    const gives: ProgressView['gives'] = [];
    if (!lg.top && lg.division < lastDivision) {
      gives.push({
        title: `${leagueName(l, lg.division + 1)} gives`,
        items: [`+${formatScore(divisionReward(l))} credits`, `${formatScore(lg.current.weekly[lg.division + 1])} credits a week`],
      });
    }
    if (next) gives.push({ title: `${next.name} league gives`, items: this.g.ranks.leagueGives(l + 1) });

    const h = lg.history.slice(-20);
    const net = h.reduce((t, v) => t + v, 0);
    this.g.ui.renderProgress('league', {
      icon: emblem(l, lg.division),
      name: leagueName(l, lg.division),
      big,
      goal,
      fraction: lg.lp / LP_PER_DIVISION,
      detail:
        lg.top || lg.promotionReady
          ? `par ${formatScore(parNow)} this week`
          : `${lg.lp} / ${LP_PER_DIVISION} lp · about ${runs} run${runs === 1 ? '' : 's'} at par`,
      checks,
      gives,
      trend: { title: h.length ? `last ${h.length} runs` : 'recent runs', values: h, summary: h.length ? `${net >= 0 ? '+' : ''}${net} lp` : '', unit: 'lp' },
      rows: [
        ['par this week', `${formatScore(parNow)} = +10 lp`],
        ['150% of par', `${formatScore(Math.round(parNow * 1.5))} = +25 lp`],
        ['active upgrade points', `${this.g.upgrades.activePoints()} (cap ${lg.current.max})`],
        ['weekly reward so far', formatScore(lg.weeklySoFar())],
      ],
      ladder: LEAGUES.map((y, k) => ({
        icon: emblem(k, k < l ? 2 : k === l ? lg.division : -1),
        name: y.name,
        needs: `${y.min === y.max ? y.max : `${y.min}-${y.max}`} upgrade points · par ${formatScore(leaguePar(k, target))}`,
        gives: k === 0 ? 'where everyone starts' : this.g.ranks.leagueGives(k).slice(0, 3).join(' · '),
        state: k < l ? 'done' : k === l ? 'current' : 'locked',
      })),
    });
    this.g.openInfo('league');
    void this.loadBoard();
  }

  /** This week's leaderboard in your league (just your best when offline). */
  private async loadBoard(): Promise<void> {
    const lg = this.g.leagues;
    const tab = BOARD_TABS[0];
    const mine = this.g.progress.weeklyBest(this.g.weekly.id);
    const own: [string, string][] = mine > 0 ? [['your best', formatScore(mine)]] : [['no ranked run yet this week', '']];
    if (this.g.connection.offline()) {
      this.g.ui.renderBoard(own, "you're offline. the board comes back with a connection");
      return;
    }
    this.g.ui.renderBoard([], this.g.backend.online ? 'loading' : '');
    const rows = await this.g.backend.board(boardQuery(tab, lg.league, this.g.now()));
    if (!this.g.backend.online || rows === null) {
      this.g.ui.renderBoard(
        own,
        !this.g.backend.online
          ? 'the leaderboards need the server'
          : this.g.connection.offline()
            ? "you're offline. the board comes back with a connection"
            : "couldn't load the board",
      );
      this.g.refreshBar();
      return;
    }
    const me = rows.find((r) => r.you);
    if (me) this.g.title.notePlace(me.rank);
    const view: [string, string][] = rows.map((r) => [`${r.rank}. ${r.you ? 'you' : r.name}`, formatScore(r.score)]);
    this.g.ui.renderBoard(view.length > 0 ? view : [['no runs yet this week', '']], LEAGUES[lg.league].name);
  }

  /** "#4 on the endless board" once a run is on its board. */
  boardNotice(board: BoardId, res: SubmitResult): void {
    if (res.status === 'ok' && res.rank && board === 'ranked') this.g.title.notePlace(res.rank);
    if (res.status === 'ok' && res.rank) this.g.ui.showNotice(`${res.newBest ? 'new best: ' : ''}#${res.rank} on the ${boardName(board)} board`);
    else if (res.status === 'rejected' && import.meta.env.DEV) console.warn(`leaderboard turned the run down: ${res.message}`);
  }

  /** Your own best on a tab, for when the board can't be read. */
  private localBest(id: string): number {
    if (id === 'week') return this.g.progress.weeklyBest(this.g.weekly.id);
    if (id === 'daily') return this.g.challenge.bestOn(this.g.today.day);
    if (id === 'endless') return this.g.progress.endlessBest;
    return this.g.progress.envBest[id] ?? 0;
  }

  /** Send your service record's summary to the boards if it's changed since last time. */
  private async syncRecord(): Promise<void> {
    if (!this.g.backend.online) return;
    const stats = this.g.record.pilotStats();
    const key = JSON.stringify(stats);
    if (key === this.g.recordSent) return;
    if (await this.g.backend.setRecord(stats)) this.g.recordSent = key;
  }

  /** A pilot's service record for their board row: rank, lifetime stats and bests. */
  private async pilotCard(pid: string): Promise<PilotCardView | null> {
    const p = await this.g.backend.pilotRecord(pid);
    if (!p) return null;
    const st = p.stats;
    const rank = Math.max(0, Math.min(RANKS.length - 1, Math.floor(st.rank ?? 0)));
    const n = (v: number | undefined): string => formatScore(v ?? 0);
    const rows: [string, string][] = [];
    if (st.runs !== undefined) {
      const secs = st.seconds ?? 0;
      const hours = Math.floor(secs / 3600);
      const mins = Math.floor((secs % 3600) / 60);
      rows.push(
        ['xp', n(st.xp)],
        ['runs', n(st.runs)],
        ['ranked runs', n(st.rankedRuns)],
        ['time played', hours > 0 ? `${hours}h ${mins}m` : `${mins}m`],
        ['distance', `${((st.distance ?? 0) / 1000).toFixed(1)} km`],
      );
    }
    const best = (board: string, label: string): void => {
      if (p.bests[board]) rows.push([label, formatScore(p.bests[board])]);
    };
    best('ranked', 'best ranked week');
    best('daily', 'best daily challenge');
    best('endless', 'best endless');
    for (const e of ENVIRONMENTS) best(`solo:${e.id}`, `best solo: ${e.name}`);
    if (st.runs !== undefined)
      rows.push(
        ['furthest level', String(st.bestLevel || 1)],
        ['best chain', `x${st.bestChain ?? 0}`],
        ['near misses', n(st.nearMisses)],
        ['pickups', n(st.pickups)],
      );
    const since = p.since ? `since ${new Date(p.since).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toLowerCase()}` : '';
    const note = [p.premium ? '◆ premium' : '', since, st.runs === undefined ? 'no stats shared yet' : ''].filter(Boolean).join(' · ');
    return { icon: insignia(rank), rank: st.rank === undefined ? 'rank unknown' : rankName(rank), note, rows };
  }

  /** A board row for the UI, with a picture of the pilot's ship (yours as you have it on now). */
  private boardRow(r: { rank: number; name: string; score: number; you: boolean; premium?: boolean; ship?: ShipLook | null; pid?: string }) {
    const ship = r.you ? this.g.shipLook() : (r.ship ?? null);
    const pid = r.pid;
    return {
      record: pid ? () => this.pilotCard(pid) : null,
      report: pid && !r.you ? (reason: ReportReason) => this.g.backend.reportPilot(pid, reason) : null,
      rank: r.rank,
      name: r.name,
      score: formatScore(r.score),
      you: r.you,
      premium: r.premium,
      picture: ship ? () => this.g.portraits.get(ship) : null,
      looks: ship ? describeShip(ship) : '',
    };
  }

  openBoards(): void {
    this.g.openInfo('boards');
    void this.showBoard(this.g.boardTab);
    void this.g.backend.pilotName().then((name) => {
      // The name is asked for here, when it's first needed: a generated one ("pilot-3fa2") invites a real one.
      const generated = !name || GENERATED_NAME.test(name);
      const note = !this.g.backend.online
        ? 'names come with the server'
        : this.g.connection.offline()
          ? 'names can be changed with a connection'
          : generated
            ? 'pick your pilot name: 3 to 16 letters, numbers, spaces, - or _'
            : '3 to 16 letters, numbers, spaces, - or _. once an hour';
      if (this.g.infoOpen === 'boards') this.g.ui.setPilotName(name ?? '', note);
    });
  }

  async showBoard(id: string): Promise<void> {
    const tab = BOARD_TABS.find((t) => t.id === id) ?? BOARD_TABS[0];
    this.g.boardTab = tab.id;
    this.g.ui.setBoardTab(tab.id);
    const seq = ++this.boardSeq;
    const caption = boardCaption(tab, this.g.leagues.league);
    const mine = this.localBest(tab.id);
    const own = mine > 0 ? [this.boardRow({ rank: 0, name: 'you', score: mine, you: true })] : [];
    if (!this.g.backend.online) {
      this.g.ui.renderLeaderboard(caption, own, 'global boards need the server. this is your best on this device.');
      return;
    }
    const offlineNote = `you're offline. the boards come back when you're connected.${own.length > 0 ? ' this is your best on this device.' : ''}`;
    if (this.g.connection.offline()) {
      this.g.ui.renderLeaderboard(caption, own, offlineNote);
      void this.g.connection.recheck();
      return;
    }
    this.g.ui.renderLeaderboard(caption, [], 'loading');
    await Promise.all([this.g.outbox.flush(), this.g.syncShip(), this.syncRecord()]); // so a run you just finished, your ship and your record are on the board
    const rows = await this.g.backend.board(boardQuery(tab, this.g.leagues.league, this.g.now()));
    if (seq !== this.boardSeq || this.g.infoOpen !== 'boards') return; // moved on while it loaded
    this.g.refreshBar();
    if (rows === null) this.g.ui.renderLeaderboard(caption, own, this.g.connection.offline() ? offlineNote : "couldn't load the board. try again in a moment");
    else if (rows.length === 0) this.g.ui.renderLeaderboard(caption, [], 'nobody yet. fly a run to be first');
    else
      this.g.ui.renderLeaderboard(
        caption,
        rows.map((r) => this.boardRow(r)),
        '',
      );
  }
}
