import { Scene } from 'three';
import { CONFIG } from '../core/config';
import { PATH_STEP } from '../core/runRules';
import { type ShipStats, STANDARD, statsFor, SYSTEMS, TIER_LEAGUE } from '../ship/upgrades';
import { type Course, courseLength, dailyRun, weeklyRun } from '../world/courses';
import { lateralSpeedAt, speedAt } from '../world/difficulty';
import { wrap } from '../world/field';
import { LivePalette } from '../world/palette';
import { type ItemSlot, World } from '../world/world';

// The server's re-fly of a ranked or daily run (the verify-run edge function,
// supabase/functions/verify-run). Both courses are their seed (the week's
// Monday, the day's date; tests/determinism.test.ts), so the server builds the
// same course the player flew, with the game's own generator, and flies the
// ship along the path the run sent (its sideways position every PATH_STEP
// units). The run doesn't send the player's boost presses or frame times, so
// this isn't a frame-for-frame replay; it checks what the course and the path
// make possible:
//
//   * the path never goes through an obstacle (field.hitTest) unless a shield
//     or phase the path picked up could have taken it, never over a pit or
//     into lava, and never moves sideways faster than the ship can steer;
//   * the time fits the course's speed curve: no faster than boosting all the
//     way, no slower than never boosting (with slow-mo and ice);
//   * the score is no more than the distance, the pickups the path passes
//     through, the near misses it makes (chained as tightly as the time
//     allows), all the boost the meter could hold and double points give,
//     and no less than the distance alone gives.
//
// The player's upgrades aren't sent either, so a ranked run is checked with
// the best ship its league allows, for each scanner tier (which power-ups
// stand depends on it), and passes if any of them could fly it. Daily runs
// fly the standard ship. The same run always gets the same verdict: the
// course is integer-seeded, and the allowances below cover the path being
// sampled every few units at whatever frame rate the phone ran.

/** A ranked or daily run as the server holds it. */
export interface RunToCheck {
  board: 'ranked' | 'daily';
  /** Ranked: the week's Monday ("2026-10-19"); daily: the UTC date it was filed under. */
  period: string;
  /** Ranked: the league it counted in (it caps the upgrades it could have had). */
  league: number;
  score: number;
  seconds: number;
  distance: number;
  finished: boolean;
  path: number[];
}

/** What the re-fly found. */
export interface Verdict {
  ok: boolean;
  /** Why not, in a few words; empty when it passed. */
  reason: string;
  /** The numbers behind it (kept with the run). */
  facts: {
    maxScore: number;
    minSeconds: number;
    maxSeconds: number;
    hits: number;
    pickups: number;
    nearMisses: number;
    scanner: number;
    ms: number;
  };
}

/**
 * Allowances, in world units unless noted. The path is sampled at the first
 * frame past each PATH_STEP mark, so a sample sits up to a frame's travel past
 * its mark and the ship curves between samples; tests/replay.test.ts flies
 * genuine runs at 20 to 120 fps and checks they all pass with these.
 */
export const SLACK = {
  /** A sample's distance past its mark, on average (half a frame at 60 fps and top speed). */
  sampleOffset: 0.5,
  /** The ship's hitbox is narrowed by this before an obstacle counts as hit; pits and lava need it either side. */
  hit: 0.12,
  /** Added to the near-miss gap and the pickup reach (more near misses and pickups count: only ever generous). */
  gap: 0.6,
  /** Hits this close to the end are the crash that ended the run. */
  end: PATH_STEP * 3,
  /** Score: this share over the most the run could make, plus a few points. */
  score: 0.01,
  scorePoints: 25,
  /** Time: this share (and seconds) either side of what the course allows. */
  time: 0.02,
  timeSeconds: 0.5,
  /** Sideways per sample beyond the steering's most. */
  sideways: 0.35,
};

/** Runs longer than this aren't re-flown (about 25 minutes at top speed): the function's CPU time. */
export const MAX_DISTANCE = 120000;

/** The re-fly's step along the course, in units (a frame at 60 fps and top speed is about 1.3). */
const STEP = 1;

/** What flying the path over the course found, before any upgrades are considered. */
interface Flight {
  /** Where the path went into an obstacle (distance into the run) and what it was. */
  hits: { d: number; what: string }[];
  /** Where the path went over a pit or into lava. */
  falls: { d: number; what: string }[];
  /** Obstacles passed within a near miss (with the allowance). */
  passes: number[];
  /** Every pickup's place, in distance order. */
  items: ItemSlot[];
  firstPowerDraw: number;
  /** Per step: its end (distance into the run), the course's pace there and whether the ship could be on ice. */
  stepD: Float64Array;
  pace: Float64Array;
  ice: Uint8Array;
  /** Path samples where the ship was being brought inside the walls (it slides faster than steering). */
  bringing: Set<number>;
}

/** The course a run was flown on. */
function courseOf(run: RunToCheck): { seed: number; course: Course | null } {
  if (run.board === 'daily') {
    const c = dailyRun(run.period).course;
    return { seed: c.seed, course: c };
  }
  return { seed: weeklyRun(run.period).seed, course: null };
}

/** The path's sideways position `d` units into the run (between samples, along the straight line). */
function pathAt(path: number[], d: number): number {
  const k = (d - SLACK.sampleOffset) / PATH_STEP;
  if (k <= 0) return path[0];
  const i = Math.floor(k);
  if (i >= path.length - 1) return path[path.length - 1];
  const f = k - i;
  return path[i] + (path[i + 1] - path[i]) * f;
}

function fly(run: RunToCheck): Flight {
  const { seed, course } = courseOf(run);
  const world = new World(new Scene(), new LivePalette());
  world.logPickups();
  world.setCourse(course);
  world.setEnvironment(null);
  world.gateRuns = false; // endless only
  world.scripted = false;
  world.collectScale = 1;
  world.powerRate = 1; // which slots are power-ups is worked out per scanner tier, from the log
  world.reset(CONFIG.field.startClearance, true, 0, seed);
  const start = world.distance;
  const end = run.distance;
  const steps = Math.ceil(end / STEP);
  const flight: Flight = {
    hits: [],
    falls: [],
    passes: [],
    items: [],
    firstPowerDraw: world.firstPowerDraw,
    stepD: new Float64Array(steps),
    pace: new Float64Array(steps),
    ice: new Uint8Array(steps),
    bringing: new Set(),
  };
  const nm = CONFIG.score.nearMiss;
  const s = SLACK.hit;
  for (let i = 0; i < steps; i++) {
    const at = world.distance - start;
    const next = Math.min(end, at + STEP);
    const section = world.sectionAt(world.distance);
    const pace = speedAt(section ? section.difficulty : at * CONFIG.score.pointsPerUnit);
    const dt = (next - at) / pace;
    const prev = world.distance;
    world.advance(dt, pace, (pathAt(run.path, next) - world.lateral) / dt);
    const d = world.distance - start;
    flight.stepD[i] = d;
    flight.pace[i] = pace;
    flight.ice[i] = world.onIce(-s) || world.onIce(0) || world.onIce(s) ? 1 : 0;
    if (world.bringing) flight.bringing.add(Math.round(d / PATH_STEP));
    if (world.hitTest(prev, s)) flight.hits.push({ d, what: world.hitName() || 'an obstacle' });
    if (world.overPit(-s) && world.overPit(0) && world.overPit(s)) flight.falls.push({ d, what: 'over a pit' });
    else if (world.inLava(-s) && world.inLava(0) && world.inLava(s)) flight.falls.push({ d, what: 'into lava' });
    const n = world.passes(prev, nm.gap + SLACK.gap);
    for (let k = 0; k < n; k++) flight.passes.push(d);
  }
  flight.items = (world.itemLog ?? []).filter((it) => it.d - start <= end + 2).map((it) => ({ ...it, d: it.d - start }));
  flight.items.sort((a, b) => a.d - b.d);
  return flight;
}

/** The best ship a league allows (every system at the highest tier it opens), with the scanner at `scanner`. */
function shipFor(run: RunToCheck, scanner: number): ShipStats {
  if (run.board === 'daily') return STANDARD; // one board for everyone: the standard ship
  const top = maxTier(run.league);
  const tiers: Record<string, number> = {};
  for (const s of SYSTEMS) tiers[s.id] = top;
  tiers.scanner = Math.min(scanner, top);
  return statsFor(tiers);
}

/** The highest upgrade tier `league` opens. */
function maxTier(league: number): number {
  let t = 0;
  while (t < TIER_LEAGUE.length && TIER_LEAGUE[t] <= league) t++;
  return t;
}

/** Re-fly a ranked or daily run: does the course and its path make this score, time and distance possible? */
export function verifyRun(run: RunToCheck): Verdict {
  const t0 = Date.now();
  const facts = { maxScore: 0, minSeconds: 0, maxSeconds: 0, hits: 0, pickups: 0, nearMisses: 0, scanner: 0, ms: 0 };
  const no = (reason: string): Verdict => ({ ok: false, reason, facts: { ...facts, ms: Date.now() - t0 } });
  const p = run.path;
  if (run.board !== 'ranked' && run.board !== 'daily') return no('not a ranked or daily run');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(run.period)) return no('no course for that period');
  if (![run.score, run.seconds, run.distance].every(Number.isFinite) || !Array.isArray(p) || !p.every(Number.isFinite)) return no('bad numbers');
  if (run.distance <= 0 || run.seconds <= 0 || p.length < 2) return no('too short to check');
  if (run.distance > MAX_DISTANCE) return no('too long to re-fly');
  if (Math.abs(p.length - Math.ceil(run.distance / PATH_STEP)) > 2) return no('the path does not match the distance');
  const course = courseOf(run).course;
  if (course) {
    const length = courseLength(course);
    if (run.distance > length + 20) return no('longer than the course');
    if (run.finished && run.distance < length - 1) return no('finished short of the line');
  }
  // The score always has the distance in it.
  const floor = Math.floor(run.distance * CONFIG.score.pointsPerUnit);
  if (run.score < floor - 1 - run.distance * 1e-4) return no('less score than the distance gives');

  const flight = fly(run);
  facts.hits = flight.hits.length;
  const top = run.board === 'daily' ? 0 : maxTier(run.league);
  let last: Verdict | null = null;
  // Each scanner tier lays the power-ups differently: any that can fly the run passes it.
  for (let scanner = 0; scanner <= top; scanner++) {
    const v = judge(run, flight, shipFor(run, scanner));
    v.facts.scanner = scanner;
    v.facts.ms = Date.now() - t0;
    if (v.ok) return v;
    last = v;
  }
  return last!;
}

/** The verdict for one ship. */
function judge(run: RunToCheck, f: Flight, ship: ShipStats): Verdict {
  const C = CONFIG;
  const P = C.powers;
  const D = run.distance;
  const facts = { maxScore: 0, minSeconds: 0, maxSeconds: 0, hits: f.hits.length, pickups: 0, nearMisses: f.passes.length, scanner: 0, ms: 0 };
  const no = (reason: string): Verdict => ({ ok: false, reason, facts });
  const boostMul = C.boost.speedMultiplier;

  // The fastest the ship can be going at each step: the course's pace so far, boosted.
  const vmax = new Float64Array(f.stepD.length);
  let paceTop = speedAt(0);
  for (let i = 0; i < f.stepD.length; i++) {
    paceTop = Math.max(paceTop, f.pace[i]);
    vmax[i] = paceTop * boostMul;
  }
  const stepAt = (d: number): number => Math.max(0, Math.min(f.stepD.length - 1, Math.ceil(d / STEP) - 1));
  const vAt = (d: number): number => vmax[stepAt(d)];

  // Which main slots are power-ups with this scanner (as World.row decides it).
  const rate = ship.powerRate;
  let nextPowerAt = P.firstAfter + (f.firstPowerDraw * 0.5) / rate;
  const isPower = f.items.map((it) => {
    if (!it.main) return false;
    if (it.d >= nextPowerAt) {
      nextPowerAt = it.d + it.spacing / rate;
      return true;
    }
    return false;
  });

  // Walk the run in distance order: what it picks up, what it hits, its near misses.
  type Ev = { d: number; kind: 'item'; i: number } | { d: number; kind: 'hit'; what: string } | { d: number; kind: 'pass' };
  const events: Ev[] = [];
  f.items.forEach((it, i) => events.push({ d: it.d, kind: 'item', i }));
  for (const h of f.hits) events.push({ d: h.d, kind: 'hit', what: h.what });
  for (const d of f.passes) events.push({ d, kind: 'pass' });
  const order = { item: 0, hit: 1, pass: 2 };
  events.sort((a, b) => a.d - b.d || order[a.kind] - order[b.kind]);

  const reach = C.boost.pickup.collectRadius * ship.collect + SLACK.gap;
  const nm = C.score.nearMiss;
  let shield = ship.startShield;
  let phaseUntil = -Infinity;
  let passUntil = -Infinity;
  let magnetUntil = -Infinity;
  let slows = 0;
  let pickups = 0;
  let chain = 0;
  let lastPass = -Infinity;
  // Points gained at each distance from pickups and near misses (for double points' windows).
  const gains: [number, number][] = [];
  const doubles: [number, number][] = [];
  for (const e of events) {
    if (e.d > D) break;
    if (e.kind === 'item') {
      const it = f.items[e.i];
      const off = it.x - pathAt(run.path, it.d);
      const near = Math.abs(it.wraps ? wrap(off) : off) <= reach;
      const power = isPower[e.i];
      if (!near && !(it.d <= magnetUntil && !power)) continue;
      if (!power) {
        pickups++;
        gains.push([it.d, C.score.pickupPoints]);
        continue;
      }
      const v = vAt(it.d);
      if (it.kind === 0) shield = true;
      else if (it.kind === 1) magnetUntil = it.d + (P.magnet.seconds + ship.magnetExtra) * v + P.magnet.reach;
      else if (it.kind === 2) slows++;
      else if (it.kind === 3) phaseUntil = it.d + P.phase.seconds * v;
      else doubles.push([it.d, it.d + P.double.seconds * v]);
    } else if (e.kind === 'hit') {
      if (e.d > D - SLACK.end || e.d <= passUntil) continue; // the crash that ended it, or passing through
      const v = vAt(e.d);
      if (e.d <= phaseUntil) {
        phaseUntil = -Infinity;
        passUntil = e.d + P.phase.passSeconds * v;
      } else if (shield) {
        shield = false;
        passUntil = e.d + (P.shield.graceSeconds + ship.graceExtra) * v;
      } else {
        return no(`the path goes through ${e.what} ${Math.round(e.d)} units in`);
      }
    } else {
      // A chain breaks after comboWindow seconds: at the fastest, that's this far.
      if (e.d - lastPass > nm.comboWindow * vAt(e.d)) chain = 0;
      chain = Math.min(chain + 1, nm.maxCombo);
      lastPass = e.d;
      gains.push([e.d, nm.points * chain]);
    }
  }
  for (const fall of f.falls) if (fall.d <= D - SLACK.end) return no(`the path goes ${fall.what} ${Math.round(fall.d)} units in`);
  facts.pickups = pickups;

  // Sideways: never faster than the ship steers. The slowest it can be going
  // (slow-mo on ice) gives the most sideways per unit forward; a sample can be
  // a frame late, at most 1/20 s (the game's longest frame).
  const p = run.path;
  for (let k = 1; k < p.length; k++) {
    if (f.bringing.has(k) || f.bringing.has(k - 1) || f.bringing.has(k + 1)) continue;
    const d = k * PATH_STEP;
    if (d > D) break;
    const pace = f.pace[stepAt(d)];
    const slowest = pace * P.slow.factor * C.hazards.ice.slow;
    const sideways = lateralSpeedAt(slowest) * ship.steer;
    const most = (sideways / slowest) * (PATH_STEP + vAt(d) / 20) + SLACK.sideways;
    if (Math.abs(p[k] - p[k - 1]) > most) return no(`the path jumps sideways ${Math.round(d)} units in`);
  }

  // Time: no faster than boosting from the start, no slower than never boosting (on ice where the path is).
  let fast = speedAt(0);
  let slow = speedAt(0);
  let tMin = 0;
  let tMax = 0;
  let at = 0;
  for (let i = 0; i < f.stepD.length; i++) {
    const h = f.stepD[i] - at;
    at = f.stepD[i];
    if (h <= 0) continue;
    const dtFast = h / (fast * boostMul);
    tMin += dtFast;
    fast += (f.pace[i] - fast) * (1 - Math.exp(-C.speed.ease * dtFast));
    const target = f.pace[i] * (f.ice[i] ? C.hazards.ice.slow : 1);
    const dtSlow = h / slow;
    tMax += dtSlow;
    slow += (target - slow) * (1 - Math.exp(-C.speed.ease * dtSlow));
  }
  // Each slow-mo: its seconds at the slowed pace, and a little for easing in and out.
  tMax += slows * (P.slow.seconds * (1 - P.slow.factor) + 0.5);
  facts.minSeconds = tMin;
  facts.maxSeconds = tMax;
  if (run.seconds < tMin * (1 - SLACK.time) - SLACK.timeSeconds) return no('faster than the ship can fly that far');
  if (run.seconds > tMax * (1 + SLACK.time) + SLACK.timeSeconds + 1) return no('slower than the ship flies');

  // Score: distance, pickups and near misses as found, the most boost the meter could
  // hold, and double points over everything in its windows.
  const ppu = C.score.pointsPerUnit;
  let score = D * ppu;
  for (const [, g] of gains) score += g;
  // ∫ boost level dt <= 2 x the time boosting (it eases in at easeIn and out at
  // easeOut = easeIn / 2), and the time boosting <= the meter that went in, drained.
  const meterIn = (run.seconds * ship.boostFill) / C.boost.fillSeconds + pickups * C.boost.pickup.amount;
  const boosting = meterIn * C.boost.drainSeconds * ship.boostDrain;
  const ease = Math.max(1, C.boost.easeIn / C.boost.easeOut);
  const boostBonus = ppu * C.score.boostBonus;
  score += boostBonus * Math.min(D, vmax[vmax.length - 1] * Math.min(run.seconds, ease * boosting));
  // Double points: the windows' union, with everything in them counted again.
  doubles.sort((a, b) => a[0] - b[0]);
  let extra = 0;
  let coveredTo = -Infinity;
  for (const [a, b] of doubles) {
    const from = Math.max(a, coveredTo);
    const to = Math.min(b, D);
    if (to <= from) continue;
    coveredTo = to;
    extra += (to - from) * ppu * (1 + C.score.boostBonus);
    for (const [d, g] of gains) if (d > from && d <= to) extra += g;
  }
  score += extra * (P.double.factor - 1);
  facts.maxScore = Math.floor(score);
  if (run.score > score * (1 + SLACK.score) + SLACK.scorePoints) return no('more score than the course and path allow');
  return { ok: true, reason: '', facts };
}
