import { storage } from './storage';

// Ranked progression, modelled on Halo 3's multiplayer ranks: two numbers,
// and a rank needs both.
//
//   XP     - earned by every ranked run (and the daily run). Never goes down.
//   skill  - 1..50. Each run is compared with the par score for your current
//            skill: beat it to go up, fall well short to go down. Ranked is a
//            weekly level with a finish, so par is a share of that week's
//            score target: 35% of it at skill 1, 120% at skill 50.
//
// Rank uses the HIGHEST skill you've ever reached, so it never drops; your
// current skill still moves. Reaching General Grade 4 takes ~50,000 XP
// (roughly 1,200 good runs) and skill 50 (consistent 40,000+ point runs).
//
// Pure maths up top (tested in tests/ranks.test.ts); the saved state below.

export interface Rank {
  name: string;
  grade: number; // 1..4 (1 = no grade shown)
  xp: number;
  skill: number; // highest skill needed
  tier: number; // insignia family index, see insignia()
}

const r = (name: string, grade: number, xp: number, skill: number, tier: number): Rank => ({ name, grade, xp, skill, tier });

/** The full ladder, lowest first. */
export const RANKS: readonly Rank[] = [
  r('recruit', 1, 0, 0, 0),
  r('apprentice', 1, 10, 0, 1),
  r('apprentice', 2, 25, 0, 1),
  r('private', 1, 50, 0, 2),
  r('private', 2, 80, 0, 2),
  r('corporal', 1, 120, 0, 3),
  r('corporal', 2, 175, 0, 3),
  r('sergeant', 1, 250, 5, 4),
  r('sergeant', 2, 350, 7, 4),
  r('sergeant', 3, 450, 9, 4),
  r('gunnery sergeant', 1, 600, 11, 5),
  r('gunnery sergeant', 2, 800, 13, 5),
  r('gunnery sergeant', 3, 1000, 15, 5),
  r('lieutenant', 1, 1300, 17, 6),
  r('lieutenant', 2, 1650, 19, 6),
  r('lieutenant', 3, 2000, 21, 6),
  r('captain', 1, 2500, 23, 7),
  r('captain', 2, 3100, 25, 7),
  r('captain', 3, 3750, 27, 7),
  r('major', 1, 4500, 29, 8),
  r('major', 2, 5400, 31, 8),
  r('major', 3, 6400, 33, 8),
  r('commander', 1, 7500, 35, 9),
  r('commander', 2, 9000, 36, 9),
  r('commander', 3, 10500, 37, 9),
  r('colonel', 1, 12500, 39, 10),
  r('colonel', 2, 15000, 40, 10),
  r('colonel', 3, 17500, 41, 10),
  r('brigadier', 1, 20000, 43, 11),
  r('brigadier', 2, 24000, 44, 11),
  r('brigadier', 3, 28000, 45, 11),
  r('general', 1, 33000, 47, 12),
  r('general', 2, 38000, 48, 12),
  r('general', 3, 44000, 49, 12),
  r('general', 4, 50000, 50, 12),
];

export const MAX_SKILL = 50;
const DAILY_BONUS_RUNS = 3; // first runs each day earn double XP
const MIN_SCORE_FOR_XP = 500; // a run that crashes straight away earns nothing

export function rankName(i: number): string {
  const rk = RANKS[i];
  return rk.grade > 1 ? `${rk.name} g${rk.grade}` : rk.name;
}

/** Highest rank index the player qualifies for. */
export function rankFor(xp: number, highestSkill: number): number {
  let best = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp && highestSkill >= RANKS[i].skill) best = i;
  return best;
}

/** A typical weekly level's score target (for when there isn't one to hand). */
export const DEFAULT_TARGET = 10000;

/** Par score at a skill level for a course with score target `target`: beat it to climb. */
export function par(skill: number, target = DEFAULT_TARGET): number {
  return Math.round(target * (0.35 + (0.85 * (skill - 1)) / 49));
}

/** XP for one run, before any daily double. */
export function xpFor(score: number): number {
  return score < MIN_SCORE_FOR_XP ? 0 : 1 + Math.floor(score / 400);
}

/** Skill change for one run at `skill` on a course with score target `target`. */
export function skillDelta(score: number, skill: number, target = DEFAULT_TARGET): number {
  const p = par(skill, target);
  if (score >= p * 1.5) return Math.min(2, MAX_SKILL - skill);
  if (score >= p) return Math.min(1, MAX_SKILL - skill);
  if (score < p * 0.5 && skill > 1) return -1;
  return 0;
}

/** Credits for a run: ranked earns 1 per 100 points, solo and endless half that. */
export function creditsFor(score: number, ranked: boolean): number {
  return Math.floor(score / (ranked ? 100 : 200));
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

/** One ranked run, kept for the service record and future leaderboards. */
export interface RunRecord {
  mode: RunMode | 'daily'; // older saves have daily runs
  week?: string; // the weekly level it was on
  score: number;
  level: number;
  seed: number;
  at: number; // ms since epoch
  xp: number;
  skill?: number; // skill after the run (older saves don't have it)
}

export interface RankedResult {
  xp: number;
  doubled: boolean;
  skillBefore: number;
  skillAfter: number;
  rankBefore: number;
  rankAfter: number;
  credits: number; // promotion bonus only (run credits are added by the caller)
}

interface Saved {
  xp: number;
  skill: number;
  highestSkill: number;
  day: { date: string; runs: number };
  history: RunRecord[];
}

const KEY = 'endless.ranked';
const HISTORY = 500;

function localDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export class Ranked {
  xp = 0;
  skill = 1;
  highestSkill = 1;
  history: RunRecord[] = [];
  private day = { date: '', runs: 0 };

  async load(): Promise<void> {
    const raw = await storage.get(KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as Partial<Saved>;
      this.xp = s.xp ?? 0;
      this.skill = s.skill ?? 1;
      this.highestSkill = Math.max(this.skill, s.highestSkill ?? 1);
      this.day = s.day ?? this.day;
      this.history = s.history ?? [];
    } catch {
      // Corrupt value: start fresh.
    }
  }

  save(): void {
    const s: Saved = { xp: this.xp, skill: this.skill, highestSkill: this.highestSkill, day: this.day, history: this.history };
    void storage.set(KEY, JSON.stringify(s));
  }

  get rank(): number {
    return rankFor(this.xp, this.highestSkill);
  }

  /** Double-XP runs left today. */
  bonusRunsLeft(now = Date.now()): number {
    return this.day.date === localDate(now) ? Math.max(0, DAILY_BONUS_RUNS - this.day.runs) : DAILY_BONUS_RUNS;
  }

  /** Fold a finished ranked or daily run in. */
  record(mode: RunMode, score: number, level: number, seed: number, now = Date.now(), target = DEFAULT_TARGET, week?: string): RankedResult {
    const rankBefore = this.rank;
    const skillBefore = this.skill;
    const today = localDate(now);
    if (this.day.date !== today) this.day = { date: today, runs: 0 };
    let xp = xpFor(score);
    const doubled = xp > 0 && this.day.runs < DAILY_BONUS_RUNS;
    if (doubled) xp *= 2;
    if (xp > 0) this.day.runs++;
    this.xp += xp;
    this.skill = Math.max(1, Math.min(MAX_SKILL, this.skill + skillDelta(score, this.skill, target)));
    this.highestSkill = Math.max(this.highestSkill, this.skill);
    const rankAfter = this.rank;
    let credits = 0;
    for (let i = rankBefore + 1; i <= rankAfter; i++) credits += promotionBonus(i);
    this.history.push({ mode, score: Math.floor(score), level, seed, at: now, xp, week, skill: this.skill });
    if (this.history.length > HISTORY) this.history.splice(0, this.history.length - HISTORY);
    this.save();
    return { xp, doubled, skillBefore, skillAfter: this.skill, rankBefore, rankAfter, credits };
  }

  /** Best ranked score today, in the last 7 days, and ever (from the kept history). */
  bests(now = Date.now()): { today: number; week: number; all: number } {
    const today = localDate(now);
    const weekAgo = now - 7 * 24 * 3600 * 1000;
    let t = 0;
    let w = 0;
    let a = 0;
    for (const h of this.history) {
      if (h.mode !== 'ranked') continue;
      a = Math.max(a, h.score);
      if (h.at >= weekAgo) w = Math.max(w, h.score);
      if (localDate(h.at) === today) t = Math.max(t, h.score);
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
