import { CONFIG } from './config';

// Bonuses earned along a run, apart from the score: distance milestones
// (endless and solo) and gate runs (endless). Pure bookkeeping, so the tests
// can fly them without a game.

/** Do milestones count in this run? Endless and solo (environments and set levels); never ranked, the daily or zen. */
export function milestonesCount(mode: 'ranked' | 'solo' | 'endless', daily: boolean, zen: boolean): boolean {
  return (mode === 'endless' || mode === 'solo') && !daily && !zen;
}

/** The milestones in units of distance (1 km = 1,000 units, as the stats count it). */
export const MILESTONES: readonly { units: number; km: number; credits: number }[] = CONFIG.milestones.km.map((km, i) => ({
  units: km * 1000,
  km,
  credits: CONFIG.milestones.credits[i],
}));

/** "2.5 km" */
export function kmText(km: number): string {
  return `${km} km`;
}

/** Each milestone passed once a run. */
export class Milestones {
  private next = 0;

  reset(): void {
    this.next = 0;
  }

  /** The milestones passed going from `before` to `after` units into the run (usually none, at most a few). */
  pass(after: number): { km: number; credits: number }[] {
    const out: { km: number; credits: number }[] = [];
    while (this.next < MILESTONES.length && after >= MILESTONES[this.next].units) {
      const m = MILESTONES[this.next++];
      out.push({ km: m.km, credits: m.credits });
    }
    return out;
  }
}

/** A gate run as the world built it: its first and last gate (distance) and how many stood. */
export interface GateSpan {
  start: number;
  end: number;
  gates: number;
}

export type GateEvent = { kind: 'ahead' } | { kind: 'clear'; credits: number } | { kind: 'missed' };

/**
 * Follows the gate runs ahead of the ship: says when one is coming up, and
 * when the ship is past it, whether it got through clean. A hit (a shield
 * save, a phase pass) anywhere in it spoils it.
 */
export class GateTracker {
  private warned = new Set<number>();
  private done = new Set<number>();
  private spoiled = new Set<number>();

  reset(): void {
    this.warned.clear();
    this.done.clear();
    this.spoiled.clear();
    this.at = -Infinity;
  }

  private at = -Infinity;
  private spans: readonly GateSpan[] = [];

  /** A hit now (the ship is at the last distance given to update). */
  hit(): void {
    for (const s of this.spans) if (this.at >= s.start - 4 && this.at <= s.end + 4) this.spoiled.add(s.start);
  }

  /** The ship is at `distance`; `spans` the gate runs built so far. Returns what happened. */
  update(distance: number, spans: readonly GateSpan[]): GateEvent[] {
    this.at = distance;
    this.spans = spans;
    const out: GateEvent[] = [];
    for (const s of spans) {
      if (s.gates < 3) continue; // too few stood (chasms, ice...): not a run
      if (!this.warned.has(s.start) && distance >= s.start - CONFIG.gateRuns.warnAhead && distance < s.start) {
        this.warned.add(s.start);
        out.push({ kind: 'ahead' });
      }
      if (!this.done.has(s.start) && distance > s.end + 3) {
        this.done.add(s.start);
        out.push(this.spoiled.has(s.start) ? { kind: 'missed' } : { kind: 'clear', credits: CONFIG.gateRuns.credits });
      }
    }
    return out;
  }
}
