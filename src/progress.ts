import { CONFIG } from './config';
import { storage } from './storage';

// Long-term progress: lifetime stats, which themes you've reached (for
// checkpoints), and the daily run's best. Saved as one JSON value.

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
  reached: number; // highest theme start level reached (1, 4, 7)
  daily: { date: string; best: number };
}

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
  let h = 0x811c9dc5;
  for (const ch of `endless-${date}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Progress {
  stats: Stats = blankStats();
  /** Highest theme start level reached: 1 (open ground), 4 (canyon), 7 (interior). */
  reached = 1;
  private daily = { date: '', best: 0 };

  async load(): Promise<void> {
    const raw = await storage.get(KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as Partial<Saved>;
      this.stats = { ...blankStats(), ...s.stats };
      this.reached = s.reached ?? 1;
      if (s.daily) this.daily = s.daily;
    } catch {
      // Corrupt value: start fresh.
    }
  }

  private save(): void {
    void storage.set(KEY, JSON.stringify({ stats: this.stats, reached: this.reached, daily: this.daily }));
  }

  get dailyBest(): number {
    return this.daily.date === today() ? this.daily.best : 0;
  }

  /** Theme start levels you can begin from: always 1, plus 4 and 7 once reached. */
  checkpoints(): number[] {
    const out = [1];
    for (let l = 1 + LPT; l <= this.reached && out.length < 3; l += LPT) out.push(l);
    return out;
  }

  /** Note that the run reached `level` (unlocks checkpoints straight away). */
  reachedLevel(level: number): void {
    const themeStart = level - ((level - 1) % LPT);
    const capped = Math.min(themeStart, 1 + LPT * 2); // checkpoints stop at the first interior
    if (capped > this.reached) {
      this.reached = capped;
      this.save();
    }
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
