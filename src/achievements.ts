import { LOOKS } from './catalogue';

// Goals. Each is a count over things the game already keeps (lifetime stats,
// bests, stars, rank), so every save already has its progress and nothing new
// is tracked. Finishing one unlocks the looks that name it (see catalogue.ts)
// and is announced after the run. The goals screen shows them all.

/** What the goals are measured from: a snapshot of the player, built by the game. */
export interface Snapshot {
  runs: number;
  distance: number; // world units, lifetime
  seconds: number; // time played, lifetime
  nearMisses: number;
  bestChain: number;
  pickups: number;
  crashes: number;
  furthest: number; // furthest level reached in ranked or endless
  endlessBest: number;
  /** Solo best by environment id. */
  envBest: Record<string, number>;
  coursesDone: number; // set levels finished
  stars: number;
  missions: number; // missions completed
  upgradePoints: number;
  looksOwned: number;
}

export type Group = 'flying' | 'skill' | 'places' | 'collection';

export interface Achievement {
  id: string;
  group: Group;
  name: string;
  text: string; // what to do, short
  target: number;
  have: (s: Snapshot) => number;
  /** Credits paid on completing it (the looks it unlocks are in the catalogue). */
  credits: number;
}

const a = (id: string, group: Group, name: string, text: string, target: number, have: (s: Snapshot) => number, credits = 0): Achievement => ({
  id,
  group,
  name,
  text,
  target,
  have,
  credits,
});

const env = (id: string) => (s: Snapshot) => s.envBest[id] ?? 0;

export const ACHIEVEMENTS: readonly Achievement[] = [
  // --- flying: how much you've done -------------------------------------------------
  a('runs-10', 'flying', 'getting started', 'fly 10 runs', 10, (s) => s.runs, 100),
  a('runs-50', 'flying', 'regular', 'fly 50 runs', 50, (s) => s.runs, 250),
  a('runs-250', 'flying', 'veteran', 'fly 250 runs', 250, (s) => s.runs, 600),
  a('runs-1000', 'flying', 'lifer', 'fly 1,000 runs', 1000, (s) => s.runs, 2000),
  a('dist-5k', 'flying', 'first miles', 'fly 5,000 units in total', 5000, (s) => s.distance, 100),
  a('dist-25k', 'flying', 'long haul', 'fly 25,000 units in total', 25000, (s) => s.distance, 300),
  a('dist-100k', 'flying', 'deep space', 'fly 100,000 units in total', 100000, (s) => s.distance, 800),
  a('dist-500k', 'flying', 'past the edge', 'fly 500,000 units in total', 500000, (s) => s.distance, 2500),
  a('time-1h', 'flying', 'settled in', 'play for an hour', 3600, (s) => s.seconds, 150),
  a('time-5h', 'flying', 'at home', 'play for five hours', 18000, (s) => s.seconds, 500),
  a('time-20h', 'flying', 'never landed', 'play for twenty hours', 72000, (s) => s.seconds, 1500),

  // --- skill: how well ----------------------------------------------------------------
  a('near-100', 'skill', 'close calls', '100 near misses in total', 100, (s) => s.nearMisses, 100),
  a('near-1k', 'skill', 'hair trigger', '1,000 near misses in total', 1000, (s) => s.nearMisses, 400),
  a('near-10k', 'skill', 'needle threader', '10,000 near misses in total', 10000, (s) => s.nearMisses, 1500),
  a('chain-6', 'skill', 'chain starter', 'a near-miss chain of 6', 6, (s) => s.bestChain, 150),
  a('chain-10', 'skill', 'chain master', 'a near-miss chain of 10', 10, (s) => s.bestChain, 500),
  a('chain-15', 'skill', 'untouchable', 'a near-miss chain of 15', 15, (s) => s.bestChain, 1500),
  a('pickups-200', 'skill', 'gold digger', 'collect 200 pickups', 200, (s) => s.pickups, 150),
  a('pickups-2k', 'skill', 'hoarder', 'collect 2,000 pickups', 2000, (s) => s.pickups, 700),
  a('crashes-100', 'skill', 'learning the hard way', 'crash 100 times', 100, (s) => s.crashes, 100),
  a('crashes-500', 'skill', 'wreckage', 'crash 500 times', 500, (s) => s.crashes, 300),

  // --- places: how far, and where -------------------------------------------------------
  a('level-6', 'places', 'lift off', 'reach level 6 in ranked or endless', 6, (s) => s.furthest, 100),
  a('level-10', 'places', 'frost line', 'reach level 10 (the ice field)', 10, (s) => s.furthest, 250),
  a('level-13', 'places', 'belt runner', 'reach level 13 (the asteroid belt)', 13, (s) => s.furthest, 400),
  a('level-19', 'places', 'lava walker', 'reach level 19 (the volcanic plain)', 19, (s) => s.furthest, 800),
  a('level-25', 'places', 'deep end', 'reach level 25', 25, (s) => s.furthest, 2000),
  a('env-ground', 'places', 'meadow runner', 'score 4,000 in open ground', 4000, env('open-ground'), 200),
  a('env-canyon', 'places', 'dune runner', 'score 4,000 in the canyon', 4000, env('canyon'), 200),
  a('env-ship', 'places', 'deckhand', 'score 4,000 in the ship interior', 4000, env('ship'), 200),
  a('env-ice', 'places', 'ice runner', 'score 4,000 on the ice field', 4000, env('ice'), 250),
  a('env-belt', 'places', 'belt boss', 'score 4,000 in the asteroid belt', 4000, env('asteroids'), 250),
  a('env-lava', 'places', 'lava boss', 'score 4,000 on the volcanic plain', 4000, env('volcanic'), 250),
  a('endless-5k', 'places', 'going places', 'score 5,000 in endless', 5000, (s) => s.endlessBest, 200),
  a('endless-15k', 'places', 'going far', 'score 15,000 in endless', 15000, (s) => s.endlessBest, 600),
  a('endless-30k', 'places', 'legend', 'score 30,000 in endless', 30000, (s) => s.endlessBest, 1500),
  a('endless-60k', 'places', 'mythic', 'score 60,000 in endless', 60000, (s) => s.endlessBest, 4000),
  a('courses-3', 'places', 'on rails', 'finish 3 set levels', 3, (s) => s.coursesDone, 200),
  a('courses-6', 'places', 'half way round', 'finish 6 set levels', 6, (s) => s.coursesDone, 500),
  a('courses-9', 'places', 'the whole route', 'finish all 9 set levels', 9, (s) => s.coursesDone, 1200),
  a('stars-5', 'places', 'star spotter', 'earn 5 stars', 5, (s) => s.stars, 100),
  a('stars-30', 'places', 'constellation', 'earn 30 stars', 30, (s) => s.stars, 600),

  // --- collection: what you've built ---------------------------------------------------------
  a('missions-5', 'collection', 'mission control', 'complete 5 missions', 5, (s) => s.missions, 200),
  a('missions-11', 'collection', 'all missions', 'complete every mission unlock (11)', 11, (s) => s.missions, 800),
  a('upgrades-10', 'collection', 'upgraded', 'own 10 upgrade points', 10, (s) => s.upgradePoints, 300),
  a('upgrades-30', 'collection', 'maxed out', 'own all 30 upgrade points', 30, (s) => s.upgradePoints, 3000),
  a('looks-25', 'collection', 'collector', 'own 25 looks', 25, (s) => s.looksOwned, 400),
  a('looks-60', 'collection', 'curator', 'own 60 looks', 60, (s) => s.looksOwned, 1500),
];

export const GROUP_NAMES: Record<Group, string> = {
  flying: 'flying',
  skill: 'skill',
  places: 'places',
  collection: 'collection',
};

export function achievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((x) => x.id === id);
}

export interface Progress {
  have: number;
  target: number;
  done: boolean;
}

/** Progress on one goal for a player. */
export function progressOn(ach: Achievement, s: Snapshot): Progress {
  const have = Math.min(ach.target, Math.max(0, ach.have(s)));
  return { have, target: ach.target, done: have >= ach.target };
}

/** Every goal's progress, by id. */
export function evaluate(s: Snapshot): Map<string, Progress> {
  return new Map(ACHIEVEMENTS.map((x) => [x.id, progressOn(x, s)]));
}

/** The ids of the goals a snapshot has finished. */
export function doneIn(s: Snapshot): Set<string> {
  const out = new Set<string>();
  for (const [id, p] of evaluate(s)) if (p.done) out.add(id);
  return out;
}

/** The looks a goal unlocks, as "slot:id" keys. */
export function rewardKeys(id: string): string[] {
  return LOOKS.filter((l) => l.unlock.by === 'achievement' && l.unlock.id === id).map((l) => `${l.slot}:${l.id}`);
}
