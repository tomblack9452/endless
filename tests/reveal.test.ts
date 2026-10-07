import { describe, expect, it, vi } from 'vitest';
import { isOpen, nextStageText, stageFor } from '../src/reveal';
import { Progress } from '../src/progress';
import { storage } from '../src/storage';

describe('staged reveal', () => {
  it('opens solo, the shop and the record after 5 valid runs, ranked after the tutorial and 5', () => {
    expect(stageFor(0, false)).toBe(0);
    expect(isOpen('shop', stageFor(4, true))).toBe(false);
    expect(isOpen('shop', stageFor(5, false))).toBe(true);
    expect(isOpen('ranked', stageFor(10, false))).toBe(false); // no tutorial yet
    expect(isOpen('ranked', stageFor(4, true))).toBe(false);
    expect(isOpen('ranked', stageFor(5, true))).toBe(true);
    expect(isOpen('leaderboard', stageFor(5, true))).toBe(true);
  });

  it('says what opens next', () => {
    expect(nextStageText(1, false)).toBe('solo, the shop and your service record open after 4 more runs of 1,000+');
    expect(nextStageText(4, true)).toBe('solo, the shop and your service record open after 1 more run of 1,000+');
    expect(nextStageText(9, false)).toBe('ranked opens after the tutorial');
    expect(nextStageText(9, true)).toBe('');
  });
});

describe('valid runs', () => {
  const run = (score: number) => ({ score, level: 1, distance: 100, seconds: 10, nearMisses: 0, bestChain: 0, pickups: 0, crashedIn: null });

  it('only runs scoring 1,000 or more count', () => {
    const p = new Progress();
    p.recordRun(run(999));
    p.recordRun(run(1000));
    p.recordRun(run(4200));
    expect(p.stats.runs).toBe(3);
    expect(p.stats.validRuns).toBe(2);
  });

  it('a save from before valid runs counts every run it played', async () => {
    vi.spyOn(storage, 'get').mockResolvedValueOnce(JSON.stringify({ stats: { runs: 7 } }));
    const p = new Progress();
    await p.load();
    expect(p.stats.validRuns).toBe(7);
  });
});
