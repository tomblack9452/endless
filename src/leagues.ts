import { storage } from './storage';

// Leagues: ranked play in brackets by ship power, so everyone in a league
// flies a ship with about the same upgrades and the tables are fair.
//
//   upgrade points  every tier you own is a point (6 systems x 5 tiers = 30)
//   cap             in a league your ACTIVE points can't be over its top
//   divisions       1, 2, 3 per league, 100 league points (LP) each
//   promotion       finish division 3 and OWN the next league's minimum
//
// Divisions can drop, leagues never do: a league stands for what you've
// bought. Personal rank (ranks.ts) carries on alongside as your lifetime level.

export interface League {
  name: string;
  min: number; // upgrade points owned to get in
  max: number; // most active points allowed while playing it
  par: number; // score for a run that holds your LP steady-ish (+10)
  promotion: number; // credits for being promoted INTO this league
  weekly: [number, number, number]; // weekly credits by division reached (1, 2, 3)
  color: string; // emblem colour
}

export const LEAGUES: readonly League[] = [
  { name: 'bronze', min: 0, max: 4, par: 3000, promotion: 0, weekly: [1000, 1250, 1500], color: '#b07a4a' },
  { name: 'silver', min: 5, max: 9, par: 5000, promotion: 2000, weekly: [1800, 2200, 2600], color: '#a3a9b1' },
  { name: 'gold', min: 10, max: 14, par: 7500, promotion: 5000, weekly: [3000, 3500, 4000], color: '#d4a63a' },
  { name: 'platinum', min: 15, max: 19, par: 11000, promotion: 10000, weekly: [4500, 5250, 6000], color: '#6fb8bd' },
  { name: 'diamond', min: 20, max: 24, par: 16000, promotion: 20000, weekly: [6500, 7500, 8500], color: '#6d9be0' },
  { name: 'champion', min: 25, max: 29, par: 23000, promotion: 35000, weekly: [9000, 10500, 12000], color: '#9a78dc' },
  { name: 'grand champion', min: 30, max: 30, par: 32000, promotion: 50000, weekly: [12000, 13500, 15000], color: '#e0573f' },
];

export const DIVISIONS = ['1', '2', '3']; // shown as numbers: the UI is lowercase
export const LP_PER_DIVISION = 100;

/** Credits for moving up a division in league `l`. */
export function divisionReward(l: number): number {
  return 300 * (l + 1);
}

/** LP for one run: +10 at par, up to +25 at 150%, 0 at 75%, down to -15 under 50%. */
export function lpFor(score: number, par: number): number {
  const p = score / par;
  if (p >= 1) return Math.round(Math.min(25, 10 + 30 * (p - 1)));
  if (p >= 0.75) return Math.round(40 * (p - 0.75));
  return Math.round(Math.max(-15, -60 * (0.75 - p)));
}

/** How much harder personal-rank skill par is in league `l` (stronger ships score more). */
export function skillParScale(l: number): number {
  return 1 + 0.05 * l;
}

export function leagueName(l: number, division: number): string {
  return l >= LEAGUES.length - 1 ? LEAGUES[l].name : `${LEAGUES[l].name} ${DIVISIONS[division]}`;
}

/** Monday-based week key for the local date, e.g. "2026-10-05". */
export function weekKey(ms: number): string {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface LeagueResult {
  lp: number; // change this run
  divisionUp: boolean;
  divisionDown: boolean;
  credits: number; // division rewards earned
}

interface Saved {
  league: number;
  division: number;
  lp: number;
  week: string;
  weekBest: number; // highest league*3+division reached this week (-1 = none played)
}

const KEY = 'endless.league';

export class Leagues {
  league = 0;
  division = 0;
  lp = 0;
  private week = '';
  private weekBest = -1;

  async load(): Promise<void> {
    const raw = await storage.get(KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as Partial<Saved>;
      this.league = s.league ?? 0;
      this.division = s.division ?? 0;
      this.lp = s.lp ?? 0;
      this.week = s.week ?? '';
      this.weekBest = s.weekBest ?? -1;
    } catch {
      // Corrupt value: start fresh.
    }
  }

  save(): void {
    const s: Saved = { league: this.league, division: this.division, lp: this.lp, week: this.week, weekBest: this.weekBest };
    void storage.set(KEY, JSON.stringify(s));
  }

  get current(): League {
    return LEAGUES[this.league];
  }

  get top(): boolean {
    return this.league >= LEAGUES.length - 1;
  }

  /** Finished division 3 with LP full: waiting on upgrade points for the next league. */
  get promotionReady(): boolean {
    return !this.top && this.division === DIVISIONS.length - 1 && this.lp >= LP_PER_DIVISION;
  }

  /** Score a ranked run in the current league. */
  record(score: number, now = Date.now()): LeagueResult {
    this.rollWeek(now);
    const delta = lpFor(score, this.current.par);
    let lp = this.lp + delta;
    let divisionUp = false;
    let divisionDown = false;
    let credits = 0;
    const lastDivision = DIVISIONS.length - 1;
    if (lp >= LP_PER_DIVISION && this.division < lastDivision && !this.top) {
      this.division++;
      lp -= LP_PER_DIVISION;
      divisionUp = true;
      credits += divisionReward(this.league);
    }
    if (lp < 0) {
      if (this.division > 0) {
        this.division--;
        lp += LP_PER_DIVISION;
        divisionDown = true;
      } else lp = 0;
    }
    // At the top of a league LP stops at full until the promotion happens.
    if ((this.division === lastDivision || this.top) && lp > LP_PER_DIVISION) lp = LP_PER_DIVISION;
    this.lp = lp;
    this.weekBest = Math.max(this.weekBest, this.league * DIVISIONS.length + this.division);
    this.save();
    return { lp: delta, divisionUp, divisionDown, credits };
  }

  /** Promote if ready and the player owns enough points. Returns the credits paid, or 0. */
  tryPromote(ownedPoints: number, now = Date.now()): number {
    if (!this.promotionReady) return 0;
    const next = LEAGUES[this.league + 1];
    if (ownedPoints < next.min) return 0;
    this.rollWeek(now);
    this.league++;
    this.division = 0;
    this.lp = 0;
    this.weekBest = Math.max(this.weekBest, this.league * DIVISIONS.length);
    this.save();
    return next.promotion;
  }

  /**
   * Pay last week's reward when a new week starts. Returns credits (0 if
   * nothing is owed). Call on load and before recording a run.
   */
  rollWeek(now = Date.now()): number {
    const key = weekKey(now);
    if (this.week === key) return 0;
    let paid = 0;
    if (this.week && this.weekBest >= 0) {
      const l = Math.floor(this.weekBest / DIVISIONS.length);
      paid = LEAGUES[l].weekly[this.weekBest % DIVISIONS.length];
    }
    this.week = key;
    this.weekBest = -1;
    this.save();
    return paid;
  }

  /** What this week's reward would be so far (0 before any ranked run this week). */
  weeklySoFar(): number {
    if (this.weekBest < 0) return 0;
    return LEAGUES[Math.floor(this.weekBest / DIVISIONS.length)].weekly[this.weekBest % DIVISIONS.length];
  }

  /** Dev: straight to the top. */
  devTop(): void {
    this.league = LEAGUES.length - 1;
    this.division = 0;
    this.lp = 0;
    this.save();
  }
}

/** League emblem as SVG (48 x 48): a shield in the league colour, with division pips. */
export function emblem(l: number, division: number): string {
  const c = LEAGUES[l].color;
  const gems = l >= 4 ? `<path d="M24 14 L30 21 L24 30 L18 21 Z" fill="#fff" opacity="0.85"/>` : `<circle cx="24" cy="21" r="5" fill="#fff" opacity="0.8"/>`;
  const crown = l >= 5 ? `<path d="M14 9 L18 4 L24 8 L30 4 L34 9 Z" fill="${c}"/>` : '';
  const pips =
    l >= LEAGUES.length - 1
      ? ''
      : DIVISIONS.map((_, k) => `<circle cx="${16 + k * 8}" cy="44" r="2.4" fill="${k <= division ? c : 'none'}" stroke="${c}" stroke-width="1.4"/>`).join('');
  return `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${crown}<path d="M24 6 L38 11 L36 28 Q34 35 24 40 Q14 35 12 28 L10 11 Z" fill="${c}"/>${gems}${pips}</svg>`;
}
