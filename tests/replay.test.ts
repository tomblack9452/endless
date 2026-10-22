import { describe, expect, it } from 'vitest';
import { verifyRun } from '../src/server/replay';
import { simulate } from './runSim';

// The server's re-fly of ranked and daily runs (src/server/replay.ts), work in
// progress: not wired to submit_run or an edge function yet, so nothing in the
// game or on the server calls it. Genuine runs from the test pilot pass;
// clear tampering fails. Known gaps (see the report in the commit): a score
// raised by a quarter or a time cut by 15% can still pass, as the bounds are
// loose for now.

const RANKED = ['2026-10-19', '2026-11-02'];

describe('re-flying a run', () => {
  for (const week of RANKED) {
    const genuine = simulate({ board: 'ranked', period: week, seconds: 150, frame: 1 / 60, boostAt: 0.3, league: 0, gain: 1.5 }).run;
    const jittery = simulate({ board: 'ranked', period: week, seconds: 150, frame: (n) => [1 / 60, 1 / 45, 1 / 120, 1 / 30, 1 / 20, 1 / 60][n % 6], boostAt: 0.3, league: 0, gain: 1.5 }).run;

    it(`accepts the test pilot's ranked runs (${week})`, () => {
      expect(verifyRun(genuine)).toMatchObject({ ok: true, reason: '' });
      expect(verifyRun(jittery).ok).toBe(true);
    });

    it(`gives the same verdict every time (${week})`, () => {
      const verdict = () => {
        const v = verifyRun(structuredClone(genuine));
        return { ...v, facts: { ...v.facts, ms: 0 } }; // ms is how long the check took
      };
      expect(verdict()).toEqual(verdict());
    });

    it(`rejects a path through an obstacle (${week})`, () => {
      const v = verifyRun({ ...genuine, path: genuine.path.map(() => genuine.path[0]) });
      expect(v.ok).toBe(false);
      expect(v.reason).toMatch(/goes through/);
    });

    it(`rejects a score far past what the course allows (${week})`, () => {
      expect(verifyRun({ ...genuine, score: genuine.score * 3 }).ok).toBe(false);
    });

    it(`rejects an impossible time (${week})`, () => {
      expect(verifyRun({ ...genuine, seconds: genuine.seconds * 0.4 }).ok).toBe(false);
    });
  }
});
