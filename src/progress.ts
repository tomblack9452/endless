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
  stars: number[]; // per sector: bit 0 cleared, bit 1 no hits, bit 2 chain
  daily: { date: string; best: number };
  courses?: Record<string, CourseResult>;
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

/** Local calendar date as YYYY-MM-DD: the daily course changes at your midnight. */
export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  /** Furthest sector reached in any mode. */
  sector = 0;
  /** Star bits per sector (see STAR_*). */
  stars: number[] = [];
  /** Set course results by course id. */
  courses: Record<string, CourseResult> = {};
  private daily = { date: '', best: 0 };

  async load(): Promise<void> {
    const raw = await storage.get(KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as Partial<Saved>;
      this.stats = { ...blankStats(), ...s.stats };
      this.sector = s.sector ?? sectorOf(s.reached ?? 1);
      this.stars = s.stars ?? [];
      this.courses = s.courses ?? {};
      if (s.daily) this.daily = s.daily;
    } catch {
      // Corrupt value: start fresh.
    }
  }

  private save(): void {
    const s: Saved = { stats: this.stats, sector: this.sector, stars: this.stars, daily: this.daily, courses: this.courses };
    void storage.set(KEY, JSON.stringify(s));
  }

  get dailyBest(): number {
    return this.daily.date === today() ? this.daily.best : 0;
  }

  /** Note that a run reached `level` (unlocks its sector as a solo start straight away). */
  reachedLevel(level: number): void {
    const s = sectorOf(level);
    if (s > this.sector) {
      this.sector = s;
      this.save();
    }
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
