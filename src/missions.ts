import { storage } from './storage';
import { formatScore } from './ui';

// Missions: three active goals at a time. Most are "in one run" (the best run
// counts); daily runs are counted across runs. Completing one raises that
// type's tier (harder next time), unlocks the next cosmetic, and draws a new
// mission of a type not already active.

export type MissionType =
  | 'level'
  | 'score'
  | 'nearMisses'
  | 'chain'
  | 'pickups'
  | 'boostTime'
  | 'rooms'
  | 'daily'
  | 'noBoostScore';

/** Targets per tier; the last tier repeats. */
const TIERS: Record<MissionType, number[]> = {
  level: [3, 5, 7, 10, 13, 16, 19],
  score: [2000, 4000, 7000, 10000, 15000, 20000, 30000],
  nearMisses: [5, 10, 18, 28, 40, 55, 70],
  chain: [3, 4, 5, 6, 8, 10, 10],
  pickups: [3, 6, 9, 13, 17, 22, 28],
  boostTime: [5, 10, 18, 28, 40, 55, 70],
  rooms: [3, 6, 10, 14, 18, 24, 30],
  daily: [1, 3, 5, 10, 15, 20, 30],
  noBoostScore: [1500, 3000, 5000, 7500, 10000, 13000, 16000],
};

const TYPES = Object.keys(TIERS) as MissionType[];

/** What a run achieved, as missions see it. */
export interface RunMetrics {
  level: number;
  score: number;
  nearMisses: number;
  bestChain: number;
  pickups: number;
  boostSeconds: number;
  rooms: number;
  boosted: boolean;
  daily: boolean;
}

interface Mission {
  type: MissionType;
  target: number;
  progress: number; // best so far (or count, for daily)
}

interface Saved {
  active: Mission[];
  tiers: Partial<Record<MissionType, number>>;
}

const KEY = 'endless.missions';

export function missionText(m: Mission): string {
  const t = m.target;
  switch (m.type) {
    case 'level':
      return `reach level ${t}`;
    case 'score':
      return `score ${formatScore(t)} in one run`;
    case 'nearMisses':
      return `${t} near misses in one run`;
    case 'chain':
      return `a x${t} near-miss chain`;
    case 'pickups':
      return `collect ${t} pickups in one run`;
    case 'boostTime':
      return `boost for ${t}s in one run`;
    case 'rooms':
      return `pass ${t} ship rooms in one run`;
    case 'daily':
      return `play ${t} daily run${t > 1 ? 's' : ''}`;
    case 'noBoostScore':
      return `score ${formatScore(t)} without boosting`;
  }
}

function valueFor(type: MissionType, r: RunMetrics): number {
  switch (type) {
    case 'level':
      return r.level;
    case 'score':
      return r.score;
    case 'nearMisses':
      return r.nearMisses;
    case 'chain':
      return r.bestChain;
    case 'pickups':
      return r.pickups;
    case 'boostTime':
      return r.boostSeconds;
    case 'rooms':
      return r.rooms;
    case 'daily':
      return 0; // counted when a daily run ends, see endRun()
    case 'noBoostScore':
      return r.boosted ? 0 : r.score;
  }
}

export class Missions {
  active: Mission[] = [];
  private tiers: Partial<Record<MissionType, number>> = {};

  async load(): Promise<void> {
    const raw = await storage.get(KEY);
    if (raw) {
      try {
        const s = JSON.parse(raw) as Partial<Saved>;
        this.active = (s.active ?? []).filter((m) => TIERS[m.type]);
        this.tiers = s.tiers ?? {};
      } catch {
        // Corrupt value: start fresh.
      }
    }
    while (this.active.length < 3) this.active.push(this.draw());
    this.save();
  }

  private save(): void {
    void storage.set(KEY, JSON.stringify({ active: this.active, tiers: this.tiers }));
  }

  private draw(): Mission {
    const taken = new Set(this.active.map((m) => m.type));
    const free = TYPES.filter((t) => !taken.has(t));
    const type = free[Math.floor(Math.random() * free.length)];
    const tier = this.tiers[type] ?? 0;
    const list = TIERS[type];
    return { type, target: list[Math.min(tier, list.length - 1)], progress: 0 };
  }

  /** Check missions against the run so far. Returns the texts of any just completed. */
  check(r: RunMetrics): string[] {
    const done: string[] = [];
    for (let i = 0; i < this.active.length; i++) {
      const m = this.active[i];
      if (m.type === 'daily') continue;
      const v = valueFor(m.type, r);
      if (v > m.progress) m.progress = v;
      if (m.progress >= m.target) {
        done.push(missionText(m));
        this.complete(i);
      }
    }
    if (done.length) this.save();
    return done;
  }

  /** At the end of a run: counts daily runs and saves best progress. */
  endRun(r: RunMetrics): string[] {
    const done = this.check(r);
    if (r.daily) {
      for (let i = 0; i < this.active.length; i++) {
        const m = this.active[i];
        if (m.type !== 'daily') continue;
        m.progress++;
        if (m.progress >= m.target) {
          done.push(missionText(m));
          this.complete(i);
        }
      }
    }
    this.save();
    return done;
  }

  private complete(i: number): void {
    const type = this.active[i].type;
    this.tiers[type] = (this.tiers[type] ?? 0) + 1;
    this.active.splice(i, 1);
    this.active.splice(i, 0, this.draw());
  }

  /** Lines for the missions screen and game over: text and progress. */
  lines(): [string, string][] {
    return this.active.map((m) => {
      const p = Math.min(m.progress, m.target);
      const shown = m.type === 'score' || m.type === 'noBoostScore' ? formatScore(p) : String(Math.floor(p));
      return [missionText(m), `${shown} / ${m.type === 'score' || m.type === 'noBoostScore' ? formatScore(m.target) : m.target}`];
    });
  }
}
