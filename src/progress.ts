import { CONFIG } from './config';
import { storage } from './storage';

// Long-term progress: lifetime stats, the furthest level reached (it opens the
// solo environments), best scores and set level results. Saved as one JSON value.

export interface Stats {
  runs: number;
  /** Runs that scored at least CONFIG.reveal.validScore: these open the game up (reveal.ts). */
  validRuns: number;
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
  reached?: number; // oldest saves: highest theme start level reached (1, 4, 7)
  sector?: number; // older saves: furthest sector reached (a theme's three levels)
  furthest?: number; // furthest level reached in ranked or endless (opens solo environments)
  stars?: number[]; // older saves: stars per sector (bit 0 cleared, bit 1 no hits, bit 2 chain), still counted
  courses?: Record<string, CourseResult>;
  weekly?: { week: string; best: number; finished: boolean };
  envBest?: Record<string, number>;
  endlessBest?: number;
  allOpen?: boolean; // maxed out: every solo environment, set level and part of the game open
}

/** Best results on a set course. */
export interface CourseResult {
  stars: number; // bits: 1 finished, 2 no hits, 4 score target
  time: number; // best finishing time, seconds (0 = never finished)
  score: number;
}

const KEY = 'endless.progress';
const LPT = CONFIG.themes.levelsPerTheme;

/** Older saves only kept the sector the player had reached: they start from its first level. */
function legacyFurthest(s: Partial<Saved>): number {
  const sector = s.sector ?? Math.floor(((s.reached ?? 1) - 1) / LPT);
  return sector * LPT + 1;
}

function blankStats(): Stats {
  return { runs: 0, validRuns: 0, distance: 0, seconds: 0, bestScore: 0, bestLevel: 0, nearMisses: 0, bestChain: 0, pickups: 0, crashes: {} };
}

function countBits(n: number): number {
  return (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1);
}

export class Progress {
  stats: Stats = blankStats();
  /** Furthest level reached in ranked or endless: what opens solo environments (see unlocks.ts). */
  furthest = 1;
  /** Stars earned before set levels existed, one entry per sector (bits as in Saved). */
  private oldStars: number[] = [];
  /** Set course results by course id. */
  courses: Record<string, CourseResult> = {};
  /** This week's ranked level: your best score on it, and whether you've finished it. */
  weekly = { week: '', best: 0, finished: false };
  /** Solo high scores by environment id (see ENVIRONMENTS in courses.ts). */
  envBest: Record<string, number> = {};
  endlessBest = 0;
  /** Maxed out (players.max_out, or the dev panel): every solo environment, set level and part of the game open. */
  allOpen = false;

  async load(): Promise<void> {
    const raw = await storage.get(KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as Partial<Saved>;
      this.stats = { ...blankStats(), ...s.stats };
      // Saves from before valid runs were counted: every run they played counts.
      if (s.stats && s.stats.validRuns === undefined) this.stats.validRuns = s.stats.runs ?? 0;
      this.furthest = Math.max(1, s.furthest ?? legacyFurthest(s));
      this.oldStars = s.stars ?? [];
      this.courses = s.courses ?? {};
      if (s.weekly) this.weekly = s.weekly;
      this.envBest = s.envBest ?? {};
      this.endlessBest = s.endlessBest ?? 0;
      this.allOpen = s.allOpen === true;
    } catch {
      // Corrupt value: start fresh.
    }
  }

  private save(): void {
    const s: Saved = {
      stats: this.stats,
      furthest: this.furthest,
      stars: this.oldStars,
      courses: this.courses,
      weekly: this.weekly,
      envBest: this.envBest,
      endlessBest: this.endlessBest,
      allOpen: this.allOpen,
    };
    void storage.set(KEY, JSON.stringify(s));
  }

  /**
   * Note that a ranked or endless run reached `level`. Returns the previous furthest level,
   * so the caller can tell what just opened. Solo, set levels and dev starts don't call this.
   */
  /** Open everything for good (maxing out). */
  openAll(): void {
    this.allOpen = true;
    this.save();
  }

  reachedLevel(level: number): number {
    const before = this.furthest;
    if (level > this.furthest) {
      this.furthest = level;
      this.save();
    }
    return before;
  }

  totalStars(): number {
    let n = 0;
    for (const s of this.oldStars) n += countBits(s ?? 0);
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

  /** Fold a finished run into the lifetime stats. */
  recordRun(r: RunResult): void {
    const s = this.stats;
    s.runs++;
    if (r.score >= CONFIG.reveal.validScore) s.validRuns++;
    s.distance += r.distance;
    s.seconds += r.seconds;
    s.bestScore = Math.max(s.bestScore, Math.floor(r.score));
    s.bestLevel = Math.max(s.bestLevel, r.level);
    s.nearMisses += r.nearMisses;
    s.bestChain = Math.max(s.bestChain, r.bestChain);
    s.pickups += r.pickups;
    if (r.crashedIn) s.crashes[r.crashedIn] = (s.crashes[r.crashedIn] ?? 0) + 1;
    this.save();
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
