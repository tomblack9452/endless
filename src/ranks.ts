import { CONFIG } from './config';
import { storage } from './storage';

// Rank: your lifetime level, a ladder of military ranks earned with XP from
// every run (ranked pays the most) and every goal finished. It never goes
// down. How good you are in ranked is the league's job (leagues.ts).
//
// Older saves also had a skill number that a rank needed as well as XP; it's
// gone, so a rank is now reached on XP alone and nobody drops.
//
// Pure maths up top (tested in tests/ranks.test.ts); the saved state below.

export interface Rank {
  name: string;
  grade: number; // 1..4 (1 = no grade shown)
  xp: number;
  tier: number; // insignia family index, see insignia()
}

const r = (name: string, grade: number, xp: number, tier: number): Rank => ({ name, grade, xp, tier });

/** The full ladder, lowest first. */
export const RANKS: readonly Rank[] = [
  r('recruit', 1, 0, 0),
  r('apprentice', 1, 10, 1),
  r('apprentice', 2, 25, 1),
  r('private', 1, 50, 2),
  r('private', 2, 80, 2),
  r('corporal', 1, 120, 3),
  r('corporal', 2, 175, 3),
  r('sergeant', 1, 250, 4),
  r('sergeant', 2, 350, 4),
  r('sergeant', 3, 450, 4),
  r('gunnery sergeant', 1, 600, 5),
  r('gunnery sergeant', 2, 800, 5),
  r('gunnery sergeant', 3, 1000, 5),
  r('lieutenant', 1, 1300, 6),
  r('lieutenant', 2, 1650, 6),
  r('lieutenant', 3, 2000, 6),
  r('captain', 1, 2500, 7),
  r('captain', 2, 3100, 7),
  r('captain', 3, 3750, 7),
  r('major', 1, 4500, 8),
  r('major', 2, 5400, 8),
  r('major', 3, 6400, 8),
  r('commander', 1, 7500, 9),
  r('commander', 2, 9000, 9),
  r('commander', 3, 10500, 9),
  r('colonel', 1, 12500, 10),
  r('colonel', 2, 15000, 10),
  r('colonel', 3, 17500, 10),
  r('brigadier', 1, 20000, 11),
  r('brigadier', 2, 24000, 11),
  r('brigadier', 3, 28000, 11),
  r('general', 1, 33000, 12),
  r('general', 2, 38000, 12),
  r('general', 3, 44000, 12),
  r('general', 4, 50000, 12),
];

/**
 * The menus' colour as you climb (the accent in style.css): a new one for each
 * band of ranks, gold for generals. `from` is a rank tier. `accent` is dark
 * enough for the page colour to read on it as text; `dark` is its light twin
 * for dark mode, light enough for the dark panel colour to read on it.
 */
export const RANK_COLOURS: readonly { from: number; name: string; accent: string; dark: string }[] = [
  { from: 0, name: 'charcoal', accent: '#2b2824', dark: '#d8d4c8' },
  { from: 1, name: 'slate', accent: '#465a6e', dark: '#9fb2c6' },
  { from: 3, name: 'pine', accent: '#2c6a5e', dark: '#6cc4a9' },
  { from: 5, name: 'cobalt', accent: '#2d58a0', dark: '#80a8f4' },
  { from: 7, name: 'violet', accent: '#64409c', dark: '#b49cf2' },
  { from: 9, name: 'crimson', accent: '#9e2f45', dark: '#f27f92' },
  { from: 11, name: 'bronze', accent: '#9c5a1f', dark: '#e59c5c' },
  { from: 12, name: 'gold', accent: '#846414', dark: '#ebc55c' },
];

/** The colour for rank `i` (an index into RANKS). */
export function rankColour(i: number): (typeof RANK_COLOURS)[number] {
  const tier = RANKS[Math.max(0, Math.min(RANKS.length - 1, i))].tier;
  let out = RANK_COLOURS[0];
  for (const c of RANK_COLOURS) if (tier >= c.from) out = c;
  return out;
}

const DAILY_BONUS_RUNS = 3; // first runs each day earn double XP
const MIN_SCORE_FOR_XP = 500; // a run that crashes straight away earns nothing

export function rankName(i: number): string {
  const rk = RANKS[i];
  return rk.grade > 1 ? `${rk.name} g${rk.grade}` : rk.name;
}

/** The rank reached with `xp`. */
export function rankFor(xp: number): number {
  let best = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) best = i;
  return best;
}

/** XP for one run, before any daily double: ranked pays the most. */
export function xpFor(score: number, ranked: boolean): number {
  if (score < MIN_SCORE_FOR_XP) return 0;
  const R = CONFIG.rank;
  return ranked ? 1 + Math.floor(score / R.rankedPointsPerXp) : Math.floor(score / R.pointsPerXp);
}

/** Credits for a run: ranked pays more per point than solo and endless. */
export function creditsFor(score: number, ranked: boolean): number {
  const C = CONFIG.economy.runCredits;
  return Math.floor(score / (ranked ? C.rankedPointsPerCredit : C.pointsPerCredit));
}

/** XP still needed for rank `i` (0 once there). */
export function xpToRank(xp: number, i: number): number {
  return Math.max(0, RANKS[i].xp - xp);
}

/** Credits for reaching rank `i` (paid once, on promotion). */
export function promotionBonus(i: number): number {
  return i * 50;
}

// --- saved state ---------------------------------------------------------------

export type RunMode = 'ranked' | 'solo' | 'endless';

/** One ranked run, kept for the service record. */
export interface RunRecord {
  mode: RunMode | 'daily'; // older saves have daily runs
  week?: string; // the weekly level it was on
  score: number;
  level: number;
  seed: number;
  at: number; // ms since epoch
  xp: number;
}

export interface RankResult {
  xp: number;
  doubled: boolean;
  rankBefore: number;
  rankAfter: number;
  credits: number; // promotion bonus only (run credits are added by the caller)
}

interface Saved {
  xp: number;
  day: { date: string; runs: number };
  history: RunRecord[];
}

const KEY = 'endless.ranked';
const HISTORY = 500;

/** The UTC date as YYYY-MM-DD: the day (double-XP runs) turns over for everyone at once. */
function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export class Ranked {
  xp = 0;
  /** Ranked runs (the service record's history and bests). */
  history: RunRecord[] = [];
  private day = { date: '', runs: 0 };

  async load(): Promise<void> {
    const raw = await storage.get(KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as Partial<Saved>;
      this.xp = s.xp ?? 0;
      this.day = s.day ?? this.day;
      this.history = s.history ?? [];
    } catch {
      // Corrupt value: start fresh.
    }
  }

  save(): void {
    const s: Saved = { xp: this.xp, day: this.day, history: this.history };
    void storage.set(KEY, JSON.stringify(s));
  }

  get rank(): number {
    return rankFor(this.xp);
  }

  /** Double-XP runs left today. */
  bonusRunsLeft(now = Date.now()): number {
    return this.day.date === utcDate(now) ? Math.max(0, DAILY_BONUS_RUNS - this.day.runs) : DAILY_BONUS_RUNS;
  }

  /** Fold a finished run in (any mode): XP, doubled for the day's first few. */
  record(mode: RunMode, score: number, level: number, seed: number, now = Date.now(), week?: string): RankResult {
    const today = utcDate(now);
    if (this.day.date !== today) this.day = { date: today, runs: 0 };
    let xp = xpFor(score, mode === 'ranked');
    const doubled = xp > 0 && this.day.runs < DAILY_BONUS_RUNS;
    if (doubled) xp *= 2;
    if (xp > 0) this.day.runs++;
    if (mode === 'ranked') {
      this.history.push({ mode, score: Math.floor(score), level, seed, at: now, xp, week });
      if (this.history.length > HISTORY) this.history.splice(0, this.history.length - HISTORY);
    }
    return { ...this.addXp(xp), xp, doubled };
  }

  /** Add XP from anywhere (a run, a goal); returns the promotions it made. */
  addXp(xp: number): { rankBefore: number; rankAfter: number; credits: number } {
    const rankBefore = this.rank;
    this.xp += Math.max(0, Math.floor(xp));
    const rankAfter = this.rank;
    let credits = 0;
    for (let i = rankBefore + 1; i <= rankAfter; i++) credits += promotionBonus(i);
    this.save();
    return { rankBefore, rankAfter, credits };
  }

  /** Best ranked score today, in the last 7 days, and ever (from the kept history). */
  bests(now = Date.now()): { today: number; week: number; all: number } {
    const today = utcDate(now);
    const weekAgo = now - 7 * 24 * 3600 * 1000;
    let t = 0;
    let w = 0;
    let a = 0;
    for (const h of this.history) {
      if (h.mode !== 'ranked') continue;
      a = Math.max(a, h.score);
      if (h.at >= weekAgo) w = Math.max(w, h.score);
      if (utcDate(h.at) === today) t = Math.max(t, h.score);
    }
    return { today: t, week: w, all: a };
  }
}

// --- insignia ------------------------------------------------------------------

/**
 * Rank insignia as SVG (48 x 48, drawn in currentColor). Enlisted ranks wear
 * chevrons, officers bars and diamonds, generals stars; grades add pips.
 */
export function insignia(i: number): string {
  const rk = RANKS[i];
  const parts: string[] = [];
  const chevron = (y: number) => `<path d="M10 ${y + 9} L24 ${y} L38 ${y + 9}" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>`;
  const rocker = (y: number) => `<path d="M11 ${y} Q24 ${y + 7} 37 ${y}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`;
  const bar = (y: number) => `<rect x="12" y="${y}" width="24" height="5" rx="1" fill="currentColor"/>`;
  const diamond = (cx: number, cy: number, s: number, fill: boolean) =>
    `<path d="M${cx} ${cy - s} L${cx + s} ${cy} L${cx} ${cy + s} L${cx - s} ${cy} Z" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>`;
  const star = (cx: number, cy: number, s: number) => {
    const pts: string[] = [];
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 === 0 ? s : s * 0.45;
      pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="currentColor"/>`;
  };
  switch (rk.tier) {
    case 0:
      parts.push(`<circle cx="24" cy="20" r="7" fill="none" stroke="currentColor" stroke-width="2.6"/>`);
      break;
    case 1:
      parts.push(chevron(14));
      break;
    case 2:
      parts.push(chevron(9), chevron(19));
      break;
    case 3:
      parts.push(chevron(5), chevron(14), chevron(23));
      break;
    case 4:
      parts.push(chevron(3), chevron(11), chevron(19), rocker(31));
      break;
    case 5:
      parts.push(chevron(1), chevron(9), chevron(17), rocker(28), rocker(35));
      break;
    case 6:
      parts.push(bar(18));
      break;
    case 7:
      parts.push(bar(12), bar(23));
      break;
    case 8:
      parts.push(diamond(24, 20, 11, false));
      break;
    case 9:
      parts.push(diamond(24, 20, 11, true));
      break;
    case 10:
      parts.push(diamond(16, 20, 8, true), diamond(32, 20, 8, true));
      break;
    case 11:
      parts.push(star(24, 20, 12));
      break;
    default:
      parts.push(star(15, 20, 9), star(33, 20, 9));
  }
  // Grade pips along the bottom.
  for (let g = 0; g < rk.grade && rk.grade > 1; g++) {
    const x = 24 + (g - (rk.grade - 1) / 2) * 8;
    parts.push(`<circle cx="${x}" cy="43" r="2.4" fill="currentColor"/>`);
  }
  return `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${parts.join('')}</svg>`;
}
