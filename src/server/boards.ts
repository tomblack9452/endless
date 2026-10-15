import { ENVIRONMENTS } from '../world/courses';
import { LEAGUES, weekKey } from '../progression/leagues';
import { dayKey } from '../economy/time';
import type { BoardId, BoardQuery } from './backend';

// The boards the leaderboard screen offers, and how a run maps onto one.

export interface BoardTab {
  id: string; // the tab
  board: BoardId;
  label: string;
}

/** Tabs in the order they're shown: the week, today's challenge, endless, then each solo environment. */
export const BOARD_TABS: readonly BoardTab[] = [
  { id: 'week', board: 'ranked', label: 'this week' },
  { id: 'daily', board: 'daily', label: 'today' },
  { id: 'endless', board: 'endless', label: 'endless' },
  ...ENVIRONMENTS.map((e): BoardTab => ({ id: e.id, board: `solo:${e.id}`, label: e.name })),
];

/** The query for a tab: the week's board is per league and per week, the day's per day (everyone together), the rest all-time. `now`: the trusted clock. */
export function boardQuery(tab: BoardTab, league: number, now = Date.now()): BoardQuery {
  if (tab.board === 'ranked') return { board: 'ranked', period: weekKey(now), league };
  if (tab.board === 'daily') return { board: 'daily', period: dayKey(now), league: 0 };
  return { board: tab.board, period: 'all', league: 0 };
}

/** What a tab's header says under its name. */
export function boardCaption(tab: BoardTab, league: number): string {
  if (tab.board === 'ranked') return `${LEAGUES[league].name} league · resets every monday`;
  if (tab.board === 'daily') return "today's challenge · everyone · new at midnight utc";
  return 'all time';
}

/** The board a finished run belongs to, or null (set levels have none). */
export function boardForRun(mode: 'ranked' | 'solo' | 'endless', environmentId: string | null, isCourse: boolean, isDaily = false): BoardId | null {
  if (mode === 'ranked') return 'ranked';
  if (isDaily) return 'daily';
  if (isCourse) return null;
  if (mode === 'solo') return environmentId ? `solo:${environmentId}` : null;
  return 'endless';
}

/** A short name for a board, for messages ("you're #3 on the endless board"). */
export function boardName(board: BoardId): string {
  if (board === 'ranked') return 'weekly';
  if (board === 'daily') return 'daily';
  if (board === 'endless') return 'endless';
  const id = board.slice(5);
  return ENVIRONMENTS.find((e) => e.id === id)?.name ?? id;
}
