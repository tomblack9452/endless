import { CONFIG } from './config';
import { type Environment, ENVIRONMENTS } from './courses';

// What opens solo, and how far off it is. Solo environments open as you get to
// them in the endless order (ranked and endless runs): reach the level where an
// area first appears and it's yours to fly alone. Set levels open one after
// another as you finish them (see game.ts); this is only about environments.

const LPT = CONFIG.themes.levelsPerTheme;

/** The level where an environment first appears in the endless order. */
export function unlockLevel(env: Environment): number {
  return env.sector * LPT + 1;
}

export interface EnvStatus {
  open: boolean;
  /** Level you need to reach. */
  level: number;
  /** Levels still to fly (0 once open). */
  toGo: number;
  /** 0..1 of the way from the previous unlock (or the start) to this one. */
  fraction: number;
}

/** Where an environment stands for a player whose furthest level in ranked or endless is `furthest`. */
export function envStatus(env: Environment, furthest: number): EnvStatus {
  const level = unlockLevel(env);
  const open = furthest >= level;
  // The bar runs between the nearest earlier unlock and this one, so it moves in useful steps.
  let from = 1;
  for (const e of ENVIRONMENTS) {
    const l = unlockLevel(e);
    if (l < level && l > from) from = l;
  }
  const fraction = open ? 1 : Math.max(0, Math.min(1, (furthest - from) / Math.max(1, level - from)));
  return { open, level, toGo: open ? 0 : level - furthest, fraction };
}

/** The closest environment still locked, or null when they're all open. */
export function nextEnvironment(furthest: number): { env: Environment; status: EnvStatus } | null {
  let best: { env: Environment; status: EnvStatus } | null = null;
  for (const env of ENVIRONMENTS) {
    const status = envStatus(env, furthest);
    if (!status.open && (!best || status.level < best.status.level)) best = { env, status };
  }
  return best;
}

/** Environments that opened between reaching `before` and `after`. */
export function newlyOpened(before: number, after: number): Environment[] {
  return ENVIRONMENTS.filter((e) => unlockLevel(e) > before && unlockLevel(e) <= after);
}
