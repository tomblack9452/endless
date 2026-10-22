import { it } from 'vitest';
import { SLACK, verifyRun } from '../src/server/replay';
import { simulate } from './runSim';
it.skipIf(!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.WEEKS)('explore (WEEKS=2026-10-19 to run it)', () => {
  const weeks = ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.WEEKS ?? '2026-10-19,2026-10-26,2026-11-02,2026-11-09,2026-11-16,2026-11-23').split(',');
  const frames: [string, number | ((n: number) => number)][] = [['60', 1 / 60], ['20', 1 / 20], ['jit', (n) => [1/60,1/45,1/120,1/30,1/20,1/60][n % 6]]];
  const old = SLACK.hit;
  for (const w of weeks) for (const [fn, f] of frames) for (const gain of [0.9, 1.5, 4]) {
    const r = simulate({ board: 'ranked', period: w, seconds: 150, frame: f, boostAt: 0.3, league: 0, gain });
    (SLACK as any).hit = 0;
    const v0 = verifyRun(r.run);
    (SLACK as any).hit = old;
    const v = verifyRun(r.run);
    const straight = verifyRun({ ...r.run, path: r.run.path.map(() => r.run.path[0]) });
    const s13 = verifyRun({ ...r.run, score: Math.round(r.run.score * 1.25) });
    const fast = verifyRun({ ...r.run, seconds: r.run.seconds * 0.85 });
    console.log(w, fn, gain, r.crashed ? 'crash' : 'alive', Math.round(r.run.distance), r.run.score, v.facts.maxScore, v.ok ? 'OK' : 'NO ' + v.reason, '| slack0', v0.ok ? 'OK' : v0.reason, '| straight', straight.ok ? 'OK!!' : straight.reason, '| x1.25', s13.ok ? 'OK!!' : s13.reason, '| fast', fast.ok ? 'OK!!' : fast.reason, v.facts.ms);
  }
}, 600000);
