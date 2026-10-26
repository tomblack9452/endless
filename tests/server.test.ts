import { describe, expect, it, vi } from 'vitest';
import WEBHOOK from '../supabase/functions/revenuecat-webhook/index.ts?raw';
import { CONFIG } from '../src/core/config';
import { type Backend, createBackend, type RunSubmission, type SubmitResult } from '../src/server/backend';
import { Outbox, RATE_GAP_MS } from '../src/server/outbox';

// The run checks live in the database (tests/sql.test.ts runs them).

describe('server', () => {
  it('runs on the device when no keys are set', async () => {
    const b = createBackend();
    expect(b.online).toBe(false);
    expect(await b.signIn()).toBe(false);
    expect(await b.spendCores(10, 'test')).toBe(true);
  });
});

describe('store', () => {
  it("the webhook pays the cores the game's products promise", () => {
    for (const p of CONFIG.economy.store.products) {
      if (!('cores' in p)) continue;
      expect(WEBHOOK, p.id).toMatch(new RegExp(`${p.id}: ${p.cores},`));
    }
  });
});

describe('the outbox and the rate limit (1.0.11)', () => {
  it('sends a run the server took as too soon again a moment later, without counting it as a failed try', async () => {
    vi.useFakeTimers();
    try {
      let last = -Infinity;
      const taken: number[] = [];
      const backend = {
        online: true,
        now: () => Date.now(),
        async submitRun(run: RunSubmission): Promise<SubmitResult> {
          if (Date.now() - last < 8000) return { status: 'retry', message: 'too many runs too quickly' };
          last = Date.now();
          taken.push(run.score);
          return { status: 'ok', rank: 1 };
        },
      } as unknown as Backend;
      const box = new Outbox(backend);
      const run = (score: number): RunSubmission => ({ board: 'endless', league: 0, score, seconds: 6, distance: 300, finished: false, path: [] });
      expect(await box.send(run(100))).toMatchObject({ status: 'ok' });
      await vi.advanceTimersByTimeAsync(6000); // a short run, quick retry
      expect(await box.send(run(200))).toMatchObject({ status: 'retry' });
      expect(box.waiting).toBe(1);
      await vi.advanceTimersByTimeAsync(RATE_GAP_MS); // nothing else happens: it goes by itself
      expect(taken).toEqual([100, 200]);
      expect(box.waiting).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
