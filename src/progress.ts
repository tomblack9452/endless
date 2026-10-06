import { CONFIG } from './config';
import { weekKey } from './leagues';
import { storage } from './storage';

// Long-term progress: lifetime stats, the furthest sector reached (solo start
// points), stars per sector, and the daily run's best. Saved as one JSON value.
//
// A sector is one theme's three levels: sector 0 is levels 1-3, sector 1 is
// 4-6 and so on, through the biome loops forever.

export interface Stats {
  runs: number;
  distance: number; // world units
  seconds: number; // time spent playing
  bestScore: number;
  bestLevel: number;
  nearMisses: number;
  bestChain: number;
  pickups: number;
  /** Crashes by where they happened (room name, or the theme outdoors). */
  crashes: Record<string, number>;
}

export interface RunResult {
  score: number;
  level: number;
  distance: number;
  seconds: number;
  nearMisses: number;
  bestChain: number;
  pickups: number;
  crashedIn: string | null; // null when the run was abandoned, not crashed
}

interface Saved {
  stats: Stats;
  reached?: number; // older saves: highest theme start level reached (1, 4, 7)
  sector: number; // furthest sector reached
  furthest?: number; // furthest level reached in ranked or endless (opens solo environments)
  stars: number[]; // per sector: bit 0 cleared, bit 1 no hits, bit 2 chain
  daily: { date: string; best: number };
  courses?: Record<string, CourseResult>;
  weekly?: { week: string; best: number; finished: boolean };
  envBest?: Record<string, number>;
  endlessBest?: number;
}

/** Best results on a set course. */
export interface CourseResult {
  stars: number; // bits: 1 finished, 2 no hits, 4 score target
  time: number; // best finishing time, seconds (0 = never finished)
  score: number;
}

/** Sector a level belongs to. */
export function sectorOf(level: number): number {
  return Math.floor((level - 1) / LPT);
}

/** First level of a sector. */
export function sectorStart(sector: number): number {
  return sector * LPT + 1;
}

/** Near-miss chain needed for a sector's third star: x5, rising by one each loop. */
export function chainTarget(sector: number): number {
  return 5 + Math.floor(sector / 3);
}

export const STAR_CLEAR = 1;
export const STAR_NO_HITS = 2;
export const STAR_CHAIN = 4;

const KEY = 'endless.progress';
const LPT = CONFIG.themes.levelsPerTheme;

function blankStats(): Stats {
  return { runs: 0, distance: 0, seconds: 0, bestScore: 0, bestLevel: 0, nearMisses: 0, bestChain: 0, pickups: 0, crashes: {} };
}

/** The UTC calendar date as YYYY-MM-DD (the same day for everyone). */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Same seed for everyone on the same date (FNV-1a hash of the date). */
export function dailySeed(date = today()): number {
  return hashSeed(`endless-${date}`);
}

/** The ranked course: the same for everyone all week, new every Monday. */
export function weeklySeed(now = Date.now()): number {
  return hashSeed(`endless-week-${weekKey(now)}`);
}

function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function countBits(n: number): number {
  return (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1);
}

export class Progress {
  stats: Stats = blankStats();
  /** Furthest sector reached in ranked or endless. */
  sector = 0;
  /** Furthest level reached in ranked or endless: what opens solo environments (see unlocks.ts). */
  furthest = 1;
  /** Star bits per sector (see STAR_*). */
  stars: number[] = [];
  /** Set course results by course id. */
  courses: Record<string, CourseResult> = {};
  /** This week's ranked level: your best score on it, and whether you've finished it. */
  weekly = { week: '', best: 0, finished: false };
  /** Solo high scores by environment id (see ENVIRONMENTS in courses.ts). */
  envBest: Record<string, number> = {};
  endlessBest = 0;
  private daily = { date: '', best: 0 };

  async load(): Promise<void> {
    const raw = await storage.get(KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as Partial<Saved>;
      this.stats = { ...blankStats(), ...s.stats };
      this.sector = s.sector ?? sectorOf(s.reached ?? 1);
      // Older saves only kept the sector: start from its first level.
      this.furthest = Math.max(1, s.furthest ?? sectorStart(this.sector));
      this.stars = s.stars ?? [];
      this.courses = s.courses ?? {};
      if (s.weekly) this.weekly = s.weekly;
      this.envBest = s.envBest ?? {};
      this.endlessBest = s.endlessBest ?? 0;
      if (s.daily) this.daily = s.daily;
    } catch {
      // Corrupt value: start fresh.
    }
  }

  private save(): void {
    const s: Saved = {
      stats: this.stats,
      sector: this.sector,
      furthest: this.furthest,
      stars: this.stars,
      daily: this.daily,
      courses: this.courses,
      weekly: this.weekly,
      envBest: this.envBest,
      endlessBest: this.endlessBest,
    };
    void storage.set(KEY, JSON.stringify(s));
  }

  get dailyBest(): number {
    return this.daily.date === today() ? this.daily.best : 0;
  }

  /**
   * Note that a ranked or endless run reached `level`. Returns the previous furthest level,
   * so the caller can tell what just opened. Solo, set levels and dev starts don't call this.
   */
  reachedLevel(level: number): number {
    const before = this.furthest;
    if (level > this.furthest) {
      this.furthest = level;
      this.sector = Math.max(this.sector, sectorOf(level));
      this.save();
    }
    return before;
  }

  starsIn(sector: number): number {
    return this.stars[sector] ?? 0;
  }

  /** Add star bits for a sector; returns how many are new. */
  addStars(sector: number, bits: number): number {
    const had = this.starsIn(sector);
    const now = had | bits;
    if (now === had) return 0;
    while (this.stars.length <= sector) this.stars.push(0);
    this.stars[sector] = now;
    this.save();
    return countBits(now) - countBits(had);
  }

  totalStars(): number {
    let n = 0;
    for (const s of this.stars) n += countBits(s ?? 0);
    for (const c of Object.values(this.courses)) n += countBits(c.stars);
    return n;
  }

  /** Best score on the weekly level `week` (0 if you haven't played it). */
  weeklyBest(week: string): number {
    return this.weekly.week === week ? this.weekly.best : 0;
  }

  /** Fold in a ranked run on weekly level `week`. Returns true for a new weekly best. */
  recordWeekly(week: string, score: number, finished: boolean): boolean {
    if (this.weekly.week !== week) this.weekly = { week, best: 0, finished: false };
    const best = Math.floor(score) > this.weekly.best;
    if (best) this.weekly.best = Math.floor(score);
    if (finished) this.weekly.finished = true;
    this.save();
    return best;
  }

  /** Solo high score in an environment; returns true for a new best. */
  recordEnv(id: string, score: number): boolean {
    const best = Math.floor(score) > (this.envBest[id] ?? 0);
    if (best) {
      this.envBest[id] = Math.floor(score);
      this.save();
    }
    return best;
  }

  /** Endless high score; returns true for a new best. */
  recordEndless(score: number): boolean {
    const best = Math.floor(score) > this.endlessBest;
    if (best) {
      this.endlessBest = Math.floor(score);
      this.save();
    }
    return best;
  }

  course(id: string): CourseResult {
    return this.courses[id] ?? { stars: 0, time: 0, score: 0 };
  }

  /** Fold in a course attempt. `stars` 0 = didn't finish. Returns new stars and whether the time is a best. */
  recordCourse(id: string, stars: number, time: number, score: number): { newStars: number; bestTime: boolean } {
    const had = this.course(id);
    const finished = (stars & 1) !== 0;
    const bestTime = finished && (had.time === 0 || time < had.time);
    const next: CourseResult = {
      stars: had.stars | stars,
      time: bestTime ? time : had.time,
      score: Math.max(had.score, Math.floor(score)),
    };
    this.courses[id] = next;
    this.save();
    return { newStars: countBits(next.stars) - countBits(had.stars), bestTime };
  }

  /** Fold a finished run into the stats; returns true for a new daily best. */
  recordRun(r: RunResult, daily: boolean): boolean {
    const s = this.stats;
    s.runs++;
    s.distance += r.distance;
    s.seconds += r.seconds;
    s.bestScore = Math.max(s.bestScore, Math.floor(r.score));
    s.bestLevel = Math.max(s.bestLevel, r.level);
    s.nearMisses += r.nearMisses;
    s.bestChain = Math.max(s.bestChain, r.bestChain);
    s.pickups += r.pickups;
    if (r.crashedIn) s.crashes[r.crashedIn] = (s.crashes[r.crashedIn] ?? 0) + 1;
    let newDaily = false;
    if (daily) {
      if (this.daily.date !== today()) this.daily = { date: today(), best: 0 };
      if (r.score > this.daily.best) {
        this.daily.best = Math.floor(r.score);
        newDaily = true;
      }
    }
    this.save();
    return newDaily;
  }

  /** Where you crash most, or null. */
  worstPlace(): string | null {
    let best: string | null = null;
    let n = 0;
    for (const [k, v] of Object.entries(this.stats.crashes)) {
      if (v > n) {
        n = v;
        best = k;
      }
    }
    return best;
  }
}
