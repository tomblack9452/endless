import { storage } from './storage';
import { formatScore } from './ui';

// Missions: three active goals at a time in each of two pools.
//   ranked - played on the week's ranked run: scores, beating your league par,
//            levels reached, pickups, ranked runs played
//   solo   - solo environments, endless and the set levels: reaching levels,
//            pickups, boost time, rooms, scoring without boosting, and so on
// "Best" missions take your best single run; "count" missions add up across
// runs. Completing one raises that type's tier (harder next time), unlocks
// the next cosmetic, and draws a new mission of a type not already active.

export type Pool = 'ranked' | 'solo';

export type MissionType =
  // ranked
  | 'rankedScore'
  | 'rankedNearMisses'
  | 'rankedChain'
  | 'beatPar'
  | 'rankedLevel'
  | 'rankedPickups'
  | 'rankedRuns'
  // solo
  | 'level'
  | 'score'
  | 'nearMisses'
  | 'chain'
  | 'pickups'
  | 'boostTime'
  | 'rooms'
  | 'noBoostScore'
  | 'levelStars';

/** Targets per tier; the last tier repeats. */
const TIERS: Record<MissionType, number[]> = {
  rankedScore: [3000, 5000, 7000, 9000, 11000, 13000, 15000],
  rankedNearMisses: [8, 14, 20, 28, 36, 45, 55],
  rankedChain: [4, 5, 6, 7, 8, 9, 10],
  beatPar: [1, 3, 5, 10, 15, 25, 40],
  rankedLevel: [3, 4, 5, 6, 7, 8, 9],
  rankedPickups: [5, 8, 12, 16, 20, 25, 30],
  rankedRuns: [3, 5, 10, 15, 20, 30, 40],
  level: [3, 5, 7, 10, 13, 16, 19],
  score: [2000, 4000, 7000, 10000, 15000, 20000, 30000],
  nearMisses: [5, 10, 18, 28, 40, 55, 70],
  chain: [3, 4, 5, 6, 8, 10, 10],
  pickups: [3, 6, 9, 13, 17, 22, 28],
  boostTime: [5, 10, 18, 28, 40, 55, 70],
  rooms: [3, 6, 10, 14, 18, 24, 30],
  noBoostScore: [1500, 3000, 5000, 7500, 10000, 13000, 16000],
  levelStars: [3, 6, 10, 15, 20, 25, 27],
};

const POOLS: Record<Pool, MissionType[]> = {
  ranked: ['rankedScore', 'rankedNearMisses', 'rankedChain', 'beatPar', 'rankedLevel', 'rankedPickups', 'rankedRuns'],
  solo: ['level', 'score', 'nearMisses', 'chain', 'pickups', 'boostTime', 'rooms', 'noBoostScore', 'levelStars'],
};

/** Missions that add up across runs (the rest take the best single run). */
const COUNTS = new Set<MissionType>(['beatPar', 'rankedRuns']);

/** What a run achieved, as missions see it. */
export interface RunMetrics {
  ranked: boolean;
  level: number;
  score: number;
  nearMisses: number;
  bestChain: number;
  pickups: number;
  boostSeconds: number;
  rooms: number;
  boosted: boolean;
  finished: boolean; // crossed a finish line
  clean: boolean; // ...without hitting anything
  beatPar: boolean; // scored at least the league par
  levelStars: number; // set level stars earned so far, in total
}

interface Mission {
  type: MissionType;
  target: number;
  progress: number; // best so far, or the running count
}

interface Saved {
  active: Mission[];
  tiers: Partial<Record<MissionType, number>>;
}

export function missionText(m: Mission): string {
  const t = m.target;
  const s = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  switch (m.type) {
    case 'rankedScore':
      return `score ${formatScore(t)} in ranked`;
    case 'rankedNearMisses':
      return `${t} near misses in one ranked run`;
    case 'rankedChain':
      return `a x${t} chain in ranked`;
    case 'beatPar':
      return `beat your league par ${s(t, 'time')}`;
    case 'rankedLevel':
      return `reach level ${t} in ranked`;
    case 'rankedPickups':
      return `collect ${t} pickups in one ranked run`;
    case 'rankedRuns':
      return `play ${s(t, 'ranked run')}`;
    case 'level':
      return `reach level ${t} in solo or endless`;
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
    case 'noBoostScore':
      return `score ${formatScore(t)} without boosting`;
    case 'levelStars':
      return `earn ${t} set level stars`;
  }
}

/** A run's value for a "best" mission (0 when it doesn't apply to this run). */
function valueFor(type: MissionType, r: RunMetrics): number {
  switch (type) {
    case 'rankedScore':
      return r.ranked ? r.score : 0;
    case 'rankedNearMisses':
      return r.ranked ? r.nearMisses : 0;
    case 'rankedChain':
      return r.ranked ? r.bestChain : 0;
    case 'rankedLevel':
      return r.ranked ? r.level : 0;
    case 'rankedPickups':
      return r.ranked ? r.pickups : 0;
    case 'level':
      return r.ranked ? 0 : r.level;
    case 'score':
      return r.ranked ? 0 : r.score;
    case 'nearMisses':
      return r.ranked ? 0 : r.nearMisses;
    case 'chain':
      return r.ranked ? 0 : r.bestChain;
    case 'pickups':
      return r.ranked ? 0 : r.pickups;
    case 'boostTime':
      return r.ranked ? 0 : r.boostSeconds;
    case 'rooms':
      return r.ranked ? 0 : r.rooms;
    case 'noBoostScore':
      return r.ranked || r.boosted ? 0 : r.score;
    case 'levelStars':
      return r.levelStars;
    default:
      return 0;
  }
}

/** How much a finished run adds to a "count" mission. */
function countFor(type: MissionType, r: RunMetrics): number {
  if (!r.ranked) return 0;
  switch (type) {
    case 'beatPar':
      return r.beatPar ? 1 : 0;
    case 'rankedRuns':
      return 1;
    default:
      return 0;
  }
}

export class Missions {
  active: Mission[] = [];
  private tiers: Partial<Record<MissionType, number>> = {};

  constructor(
    readonly pool: Pool,
    private readonly key: string,
  ) {}

  async load(): Promise<void> {
    const raw = await storage.get(this.key);
    if (raw) {
      try {
        const s = JSON.parse(raw) as Partial<Saved>;
        const mine = new Set(POOLS[this.pool]);
        this.active = (s.active ?? []).filter((m) => mine.has(m.type));
        this.tiers = s.tiers ?? {};
      } catch {
        // Corrupt value: start fresh.
      }
    }
    while (this.active.length < 3) this.active.push(this.draw());
    this.save();
  }

  private save(): void {
    void storage.set(this.key, JSON.stringify({ active: this.active, tiers: this.tiers }));
  }

  private draw(): Mission {
    const taken = new Set(this.active.map((m) => m.type));
    const free = POOLS[this.pool].filter((t) => !taken.has(t));
    const type = free[Math.floor(Math.random() * free.length)];
    const tier = this.tiers[type] ?? 0;
    const list = TIERS[type];
    return { type, target: list[Math.min(tier, list.length - 1)], progress: 0 };
  }

  /** Check "best" missions against the run so far. Returns the texts of any just completed. */
  check(r: RunMetrics): string[] {
    const done: string[] = [];
    for (let i = 0; i < this.active.length; i++) {
      const m = this.active[i];
      if (COUNTS.has(m.type)) continue;
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

  /** At the end of a run: best missions, plus the running counts. */
  endRun(r: RunMetrics): string[] {
    const done = this.check(r);
    for (let i = 0; i < this.active.length; i++) {
      const m = this.active[i];
      if (!COUNTS.has(m.type)) continue;
      m.progress += countFor(m.type, r);
      if (m.progress >= m.target) {
        done.push(missionText(m));
        this.complete(i);
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
      const big = m.type === 'score' || m.type === 'noBoostScore' || m.type === 'rankedScore';
      return [missionText(m), `${big ? formatScore(p) : Math.floor(p)} / ${big ? formatScore(m.target) : m.target}`];
    });
  }
}
