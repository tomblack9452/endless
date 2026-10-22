import { Scene } from 'three';
import { CONFIG } from '../src/core/config';
import { type BoostState, chainLink, PathRecorder, stepBoost } from '../src/core/runRules';
import type { RunToCheck } from '../src/server/replay';
import { type ShipStats, STANDARD } from '../src/ship/upgrades';
import { dailyRun, weeklyRun } from '../src/world/courses';
import { lateralSpeedAt, speedAt } from '../src/world/difficulty';
import { LivePalette } from '../src/world/palette';
import { World } from '../src/world/world';

// A genuine ranked or daily run, flown headless the way the game flies one
// (updatePlaying in src/core/game.ts: the same speed easing, boost meter,
// power-ups, near-miss chain, double points and path sampling), by the test
// pilot (tests/pilot.ts: it follows the safe lane through its easing). What it
// sends is what the game would send, for the server's re-fly to judge.

export interface SimOptions {
  board: 'ranked' | 'daily';
  period: string;
  league?: number;
  /** The longest the run goes on if nothing ends it (seconds). */
  seconds: number;
  /** Frame time: a fixed rate, or one per frame (jittery phones). */
  frame: number | ((n: number) => number);
  /** Hold boost whenever the meter is at least this full (Infinity: never). */
  boostAt?: number;
  ship?: ShipStats;
  /** How hard the pilot steers back to the lane (tests/pilot.ts uses 1.5). */
  gain?: number;
}

export interface SimResult {
  run: RunToCheck;
  crashed: boolean;
  finished: boolean;
  pickups: number;
  nearMisses: number;
  powers: number;
  boostSeconds: number;
}

interface Hooked {
  row(d: number): void;
  lane: number;
  shipX: number;
}

export function simulate(o: SimOptions): SimResult {
  const daily = o.board === 'daily' ? dailyRun(o.period) : null;
  const course = daily?.course ?? null;
  const seed = daily ? daily.course.seed : weeklyRun(o.period).seed;
  const ship = daily ? STANDARD : (o.ship ?? STANDARD);
  const world = new World(new Scene(), new LivePalette());
  const h = world as unknown as Hooked;
  const lanes: [number, number][] = [];
  const row = h.row.bind(world);
  h.row = (d: number) => {
    row(d);
    lanes.push([d, h.lane]);
    if (lanes.length > 800) lanes.shift();
  };
  world.setCourse(course);
  world.setEnvironment(null);
  world.gateRuns = false;
  world.collectScale = ship.collect;
  world.powerRate = ship.powerRate;
  world.reset(CONFIG.field.startClearance, true, 0, seed);
  const laneAt = (d: number): number => {
    let best = h.shipX;
    let gap = Infinity;
    for (const [rd, x] of lanes) {
      const g = Math.abs(rd - d);
      if (g < gap) {
        gap = g;
        best = x;
      }
    }
    return best;
  };

  const C = CONFIG;
  const P = C.powers;
  const nm = C.score.nearMiss;
  const runStart = world.distance;
  const path = new PathRecorder();
  const boost: BoostState = { meter: 0, boosting: false, level: 0 };
  let speed = speedAt(0);
  let runTime = 0;
  let distanceScore = 0;
  let bonus = 0;
  let score = 0;
  let steer = 0;
  let shield = ship.startShield;
  let graceT = 0;
  let phaseT = 0;
  let passT = 0;
  let doubleT = 0;
  let magnetT = 0;
  let slowT = 0;
  let slowLevel = 0;
  let chain = 0;
  let chainTimer = 0;
  let pickups = 0;
  let nearMisses = 0;
  let powers = 0;
  let boostSeconds = 0;
  let crashed = false;
  let finished = false;
  for (let n = 0; runTime < o.seconds; n++) {
    const dt = typeof o.frame === 'number' ? o.frame : o.frame(n);
    runTime += dt;
    const before = distanceScore + bonus;
    const section = course ? world.sectionAt(world.distance) : null;
    const onIce = world.onIce();
    const pace = speedAt(section ? section.difficulty : distanceScore);
    const target = pace * (onIce ? C.hazards.ice.slow : 1);
    speed += (target - speed) * (1 - Math.exp(-C.speed.ease * dt));
    stepBoost(boost, dt, boost.meter >= (o.boostAt ?? Infinity) || (boost.boosting && boost.meter > 0), ship.boostFill, ship.boostDrain);
    if (boost.boosting) boostSeconds += dt;
    const slow = 1 - (1 - P.slow.factor) * slowLevel;
    const v = speed * (1 + (C.boost.speedMultiplier - 1) * boost.level) * slow;
    const want = Math.max(-1, Math.min(1, (laneAt(world.distance + 3) - h.shipX) * (o.gain ?? 1.5)));
    steer += (want - steer) * (1 - Math.exp(-C.steering.response * (onIce ? C.hazards.ice.grip : 1) * dt));
    const prev = world.distance;
    world.advance(dt, v, steer * lateralSpeedAt(v) * ship.steer);
    path.record(world.distance - runStart, world.lateral, runTime);
    const got = world.collect(prev);
    if (got > 0) {
      boost.meter = Math.min(1, boost.meter + got * C.boost.pickup.amount);
      bonus += got * C.score.pickupPoints;
      pickups += got;
    }
    const power = world.collectPower(prev);
    if (power >= 0) {
      powers++;
      if (power === 0) shield = true;
      else if (power === 1) magnetT = P.magnet.seconds + ship.magnetExtra;
      else if (power === 2) slowT = P.slow.seconds;
      else if (power === 3) phaseT = P.phase.seconds;
      else doubleT = P.double.seconds;
    }
    graceT = Math.max(0, graceT - dt);
    phaseT = Math.max(0, phaseT - dt);
    passT = Math.max(0, passT - dt);
    doubleT = Math.max(0, doubleT - dt);
    if (magnetT > 0) {
      magnetT = Math.max(0, magnetT - dt);
      world.attractPickups(dt);
    }
    slowT = Math.max(0, slowT - dt);
    slowLevel += ((slowT > 0 ? 1 : 0) - slowLevel) * (1 - Math.exp(-4 * dt));
    const distancePoints = (world.distance - runStart) * C.score.pointsPerUnit;
    bonus += (distancePoints - distanceScore) * C.score.boostBonus * boost.level;
    distanceScore = distancePoints;
    if (course && world.distance >= world.finishAt) {
      finished = true; // sent with the score as it stood last frame, like the game
      break;
    }
    if (world.inLava()) {
      crashed = true;
      break;
    }
    const fell = world.overPit();
    let scraped = false;
    const guarded = shield || graceT > 0 || phaseT > 0 || passT > 0;
    if (!fell && guarded) scraped = world.clampToWalls(C.ship.hitHalfWidth + 0.15);
    const passing = graceT > 0 || passT > 0;
    const struck = !fell && !passing && world.hitTest(prev);
    const hit = struck || (!fell && !passing && scraped && shield);
    if (struck && phaseT > 0) {
      phaseT = 0;
      passT = P.phase.passSeconds;
    } else if (hit && shield) {
      shield = false;
      graceT = P.shield.graceSeconds + ship.graceExtra;
    } else if (fell || hit) {
      crashed = true;
      break;
    }
    const k = world.passes(prev, C.audio.passRange);
    for (let i = 0; i < k; i++) {
      if (world.passGap[i] > nm.gap) continue;
      const link = chainLink(chain);
      chain = link.chain;
      bonus += link.points;
      nearMisses++;
      chainTimer = nm.comboWindow;
    }
    if (chain > 0) {
      chainTimer -= dt;
      if (chainTimer <= 0) chain = 0;
    }
    const gained = distanceScore + bonus - before;
    if (doubleT > 0 && gained > 0) bonus += gained * (P.double.factor - 1);
    score = distanceScore + bonus;
  }
  // A crash (or the finish) is sent with the score as the frame before left it, as in the game.
  return {
    run: {
      board: o.board,
      period: o.period,
      league: o.league ?? 0,
      score: Math.floor(score),
      seconds: runTime,
      distance: world.distance - runStart,
      finished,
      path: [...path.xs],
    },
    crashed,
    finished,
    pickups,
    nearMisses,
    powers,
    boostSeconds,
  };
}
