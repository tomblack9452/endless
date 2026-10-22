import { CONFIG } from './config';

// The rules of a run that the game and the server's re-fly (src/server/replay.ts)
// share: how the path is sampled, how the boost meter fills, drains and eases,
// and what a near-miss chain pays. Pure: no rendering, sound or clock.

/** Ranked and daily runs record the ship's sideways position every PATH_STEP units of distance. */
export const PATH_STEP = 4;

/** The ship's sideways position every PATH_STEP units (the leaderboard's check, the ghost), with the run time at each. */
export class PathRecorder {
  readonly xs: number[] = [];
  readonly ts: number[] = [];
  private next = 0;

  reset(): void {
    this.xs.length = 0;
    this.ts.length = 0;
    this.next = 0;
  }

  /** The ship is `run` units into the run at sideways `lateral`, `time` seconds in. */
  record(run: number, lateral: number, time: number): void {
    while (run >= this.next) {
      this.xs.push(Math.round(lateral * 100) / 100);
      this.ts.push(Math.round(time * 1000) / 1000);
      this.next += PATH_STEP;
    }
  }
}

/** The boost meter (0..1), whether it's on, and its eased level (0..1, scaling speed and the bonus). */
export interface BoostState {
  meter: number;
  boosting: boolean;
  level: number;
}

/**
 * One frame of boost: `want` is the player holding it, `fill` and `drain` the
 * ship's upgrades (1 on the standard ship). Says when it starts or stops
 * ('empty': it ran out), for the sound.
 */
export function stepBoost(s: BoostState, dt: number, want: boolean, fill: number, drain: number): 'start' | 'stop' | 'empty' | null {
  const b = CONFIG.boost;
  let event: 'start' | 'stop' | 'empty' | null = null;
  if (s.boosting) {
    if (!want || s.meter <= 0) {
      s.boosting = false;
      event = s.meter <= 0 ? 'empty' : 'stop';
    }
  } else if (want && s.meter >= b.minToStart) {
    s.boosting = true;
    event = 'start';
  }
  if (s.boosting) s.meter = Math.max(0, s.meter - dt / (b.drainSeconds * drain));
  else s.meter = Math.min(1, s.meter + (dt * fill) / b.fillSeconds);
  const goal = s.boosting ? 1 : 0;
  const rate = s.boosting ? b.easeIn : b.easeOut;
  s.level += (goal - s.level) * (1 - Math.exp(-rate * dt));
  return event;
}

/** A near miss on a chain of `chain`: the chain it makes and the points it pays (points x chain length, capped). */
export function chainLink(chain: number): { chain: number; points: number } {
  const nm = CONFIG.score.nearMiss;
  const next = Math.min(chain + 1, nm.maxCombo);
  return { chain: next, points: nm.points * next };
}
