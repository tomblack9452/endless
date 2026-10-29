import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { DEFAULT_SETTINGS, migrateSettings } from '../src/core/settings';
import { crashMomentOn, crashOverReady, crashTimeScale } from '../src/core/crashMoment';
import { GateTracker, MILESTONES, Milestones, milestonesCount } from '../src/core/runBonus';
import { featureRand, rand, seed } from '../src/core/rng';
import { rivalGhost } from '../src/ship/ghost';
import { speedAt } from '../src/world/difficulty';
import { LivePalette } from '../src/world/palette';
import { pickPower, POWER_KINDS, World } from '../src/world/world';
import { distanceText, sparkPoints, sparkSvg, summaryRows } from '../src/ui/runSummary';

// 1.0.9's gameplay depth: the new power-ups' weights, distance milestones,
// gate runs' bookkeeping, the crash moment's timing, the run summary, the
// rival's ghost, and the second random stream that keeps older courses as
// they were.

describe('the power-up pool', () => {
  it('has phase and double points, each with a weight, and picks by weight from one draw', () => {
    expect(POWER_KINDS).toEqual(['shield', 'magnet', 'slow', 'phase', 'double']);
    const counts = [0, 0, 0, 0, 0];
    const N = 20000;
    for (let i = 0; i < N; i++) counts[pickPower(i / N)]++;
    const w = CONFIG.powers.weights;
    const total = POWER_KINDS.reduce((n, k) => n + w[k], 0);
    POWER_KINDS.forEach((k, i) => expect(counts[i] / N).toBeCloseTo(w[k] / total, 2));
    expect(pickPower(0)).toBe(0);
    expect(pickPower(0.999999)).toBe(4);
  });

  it('turns up on the course: every kind within a long endless run, the same for a seed', () => {
    const lay = () => {
      const world = new World(new Scene(), new LivePalette());
      world.reset(CONFIG.field.startClearance, true, 0, 99);
      const kinds = new Set<number>();
      const f = (world as unknown as { powers: { top: number; active: Uint8Array; colorIdx: Uint8Array; d: Float64Array } }).powers;
      const seen: string[] = [];
      for (let t = 0; t < 1200; t += 1 / 30) {
        world.advance(1 / 30, 60, 0);
        for (let i = 0; i < f.top; i++)
          if (f.active[i]) {
            kinds.add(f.colorIdx[i]);
            const key = `${Math.round(f.d[i])}:${f.colorIdx[i]}`;
            if (!seen.includes(key)) seen.push(key);
          }
      }
      return { kinds, seen };
    };
    const a = lay();
    expect([...a.kinds].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(lay().seen).toEqual(a.seen);
  });
});

describe('the second random stream', () => {
  it("is seeded with the course and never moves the first stream's draws", () => {
    seed(1234);
    const plain = [rand(), rand(), rand()];
    seed(1234);
    const a = rand();
    featureRand();
    featureRand();
    expect([a, rand(), rand()]).toEqual(plain);
    seed(1234);
    const f1 = featureRand();
    seed(1234);
    expect(featureRand()).toBe(f1);
    seed(1235);
    expect(featureRand()).not.toBe(f1);
  });
});

describe('distance milestones', () => {
  it('pay at 1, 2.5, 5, 10 and 20 km, each once a run', () => {
    expect(MILESTONES.map((m) => m.units)).toEqual([1000, 2500, 5000, 10000, 20000]);
    const m = new Milestones();
    expect(m.pass(999)).toEqual([]);
    expect(m.pass(1000)).toEqual([{ km: 1, credits: CONFIG.milestones.credits[0] }]);
    expect(m.pass(1200)).toEqual([]);
    expect(m.pass(6000).map((x) => x.km)).toEqual([2.5, 5]);
    expect(m.pass(30000).map((x) => x.km)).toEqual([10, 20]);
    expect(m.pass(90000)).toEqual([]);
    m.reset();
    expect(m.pass(1000)).toHaveLength(1);
  });

  it('count in endless and solo only: never ranked, the daily challenge or zen', () => {
    expect(milestonesCount('endless', false, false)).toBe(true);
    expect(milestonesCount('solo', false, false)).toBe(true);
    expect(milestonesCount('ranked', false, false)).toBe(false);
    expect(milestonesCount('solo', true, false)).toBe(false);
    expect(milestonesCount('endless', false, true)).toBe(false);
  });
});

describe('gate runs (bookkeeping)', () => {
  const span = { start: 1000, end: 1104, gates: 5 };

  it('warns on approach, then pays a clean run once', () => {
    const g = new GateTracker();
    expect(g.update(800, [span])).toEqual([]);
    expect(g.update(1000 - CONFIG.gateRuns.warnAhead + 1, [span])).toEqual([{ kind: 'ahead' }]);
    expect(g.update(1050, [span])).toEqual([]);
    expect(g.update(1110, [span])).toEqual([{ kind: 'clear', credits: CONFIG.gateRuns.credits }]);
    expect(g.update(1200, [span])).toEqual([]);
  });

  it('pays nothing after a hit inside it (a shield or phase save), but a hit before it does not count', () => {
    const g = new GateTracker();
    g.update(900, [span]);
    g.hit(); // before the run
    g.update(1040, [span]);
    g.hit();
    g.update(1060, [span]);
    expect(g.update(1110, [span])).toEqual([{ kind: 'missed' }]);
    const clean = new GateTracker();
    clean.update(900, [span]);
    clean.hit();
    expect(clean.update(1110, [span]).at(-1)).toEqual({ kind: 'clear', credits: CONFIG.gateRuns.credits });
  });

  it('ignores a run where too few gates stood', () => {
    expect(new GateTracker().update(2000, [{ start: 1000, end: 1030, gates: 2 }])).toEqual([]);
  });
});

describe('the crash moment', () => {
  const base = { setting: true, reduceMotion: false, ranked: false, practice: false, zen: false };

  it('plays outside ranked, and never with reduce motion, the setting off, the practice run or zen', () => {
    expect(crashMomentOn(base)).toBe(true);
    expect(crashMomentOn({ ...base, ranked: true })).toBe(false);
    expect(crashMomentOn({ ...base, reduceMotion: true })).toBe(false);
    expect(crashMomentOn({ ...base, setting: false })).toBe(false);
    expect(crashMomentOn({ ...base, practice: true })).toBe(false);
    expect(crashMomentOn({ ...base, zen: true })).toBe(false);
    expect(DEFAULT_SETTINGS.crashMoment).toBe(true);
  });

  it('runs slowed for its second, then the revive offer comes straight away with its whole timer', () => {
    const ms = CONFIG.crashMoment.ms;
    expect(ms).toBe(1000);
    expect(crashTimeScale(0, true)).toBe(CONFIG.crashMoment.timeScale);
    expect(crashTimeScale(ms, true)).toBe(1);
    expect(crashTimeScale(0, false)).toBe(1);
    // Fly the crash's clock frame by frame: the offer (or the end screen) is ready the frame the moment ends.
    let real = 0;
    let scene = 0;
    let readyAt = -1;
    for (let f = 0; f < 200 && readyAt < 0; f++) {
      const dt = 1000 / 60;
      scene += dt * crashTimeScale(real, true);
      real += dt;
      if (crashOverReady(real, scene, true)) readyAt = real;
    }
    expect(readyAt).toBeGreaterThanOrEqual(ms);
    expect(readyAt).toBeLessThan(ms + 20);
    // Without the moment, as before.
    expect(crashOverReady(0, CONFIG.crash.overDelayMs - 1, false)).toBe(false);
    expect(crashOverReady(0, CONFIG.crash.overDelayMs, false)).toBe(true);
    // The moment holds the offer back by under half a second, and its timer only starts when it shows.
    expect(ms - CONFIG.crash.overDelayMs).toBeLessThan(500);
  });
});

describe('the run summary', () => {
  it('draws the speed as a line in its box, lowest at the bottom', () => {
    expect(sparkPoints([5], 100, 40)).toBe('');
    const pts = sparkPoints([36, 50, 75], 100, 40)
      .split(' ')
      .map((p) => p.split(',').map(Number));
    expect(pts[0]).toEqual([0, 39]);
    expect(pts[2]).toEqual([100, 1]);
    expect(sparkSvg([40, 41, 42])).toContain('<polyline');
    expect(sparkSvg([])).toBe('');
  });

  it('says where the run ended, what was hit, near misses and the best chain', () => {
    expect(distanceText(1840)).toBe('1.8 km');
    expect(distanceText(12400)).toBe('12 km');
    expect(distanceText(648)).toBe('640 m');
    const rows = summaryRows({ speeds: [36, 52], distance: 1840, level: 2, nearMisses: 14, bestChain: 5, crashed: true, hit: 'a rock spire' });
    expect(rows).toEqual([
      ['crashed at', '1.8 km · level 2'],
      ['hit', 'a rock spire'],
      ['near misses', '14'],
      ['best chain', 'x5'],
    ]);
    expect(summaryRows({ speeds: [], distance: 3600, level: 1, nearMisses: 0, bestChain: 0, crashed: false, hit: '' })[0][0]).toBe('finished at');
  });
});

describe("the rival's ghost", () => {
  it('is off by default (a setting), and older saves get it off', () => {
    expect(DEFAULT_SETTINGS.rivalGhost).toBe(false);
    expect(migrateSettings({ ghost: true }).rivalGhost).toBe(false);
  });

  it("rebuilds the times of a path from how the course speeds up, ending at the run's own time", () => {
    const path = Array.from({ length: 1000 }, (_, i) => Math.sin(i / 20));
    const g = rivalGhost(path, 75, '2026-10-19');
    expect(g.xs).toEqual(path);
    expect(g.ts).toHaveLength(path.length);
    expect(g.ts[0]).toBe(0);
    expect(g.ts.at(-1)).toBeCloseTo(75, 1);
    for (let i = 1; i < g.ts.length; i++) expect(g.ts[i]).toBeGreaterThan(g.ts[i - 1]);
    // Faster later on: the last steps take less time than the first.
    expect(g.ts[1] - g.ts[0]).toBeGreaterThan(g.ts.at(-1)! - g.ts.at(-2)!);
    expect(speedAt(4000 * CONFIG.score.pointsPerUnit)).toBeGreaterThan(speedAt(0));
  });
});
