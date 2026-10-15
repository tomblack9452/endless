import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { quickRetryOn, tapRetries, type RetryTap } from '../src/core/retry';

// A tap after a crash: when it flies again, with quick retry and without.

const LOCK = CONFIG.crash.retryLockMs;
const tap = (over: Partial<RetryTap> = {}): boolean =>
  tapRetries({ crashMs: LOCK, settledMs: 0, revivePending: false, offerOpen: false, quick: false, lockMs: LOCK, ...over });

describe('quick retry', () => {
  it('is off by default, and never in ranked or the tutorial', () => {
    expect(DEFAULT_SETTINGS.quickRetry).toBe(false);
    expect(quickRetryOn(false, 'endless', false)).toBe(false);
    expect(quickRetryOn(true, 'endless', false)).toBe(true);
    expect(quickRetryOn(true, 'solo', false)).toBe(true);
    expect(quickRetryOn(true, 'ranked', false)).toBe(false);
    expect(quickRetryOn(true, 'endless', true)).toBe(false);
  });

  it('keeps the retry lock: a tap straight after the crash does nothing, with it or without', () => {
    expect(LOCK).toBeGreaterThanOrEqual(500);
    for (const quick of [false, true]) {
      expect(tap({ quick, crashMs: 0 })).toBe(false);
      expect(tap({ quick, crashMs: LOCK - 1 })).toBe(false);
      expect(tap({ quick, crashMs: LOCK })).toBe(true);
    }
  });

  it('waits for the revive offer to be settled', () => {
    for (const quick of [false, true]) {
      expect(tap({ quick, crashMs: 5000, revivePending: true })).toBe(false);
      expect(tap({ quick, crashMs: 5000, offerOpen: true })).toBe(false);
    }
  });

  it('runs the lock again from the offer being turned down, so that tap never restarts too', () => {
    expect(tap({ quick: true, crashMs: 4000, settledMs: 3800 })).toBe(false);
    expect(tap({ quick: true, crashMs: 3800 + LOCK, settledMs: 3800 })).toBe(true);
    expect(tap({ quick: false, crashMs: 4000, settledMs: 3800 })).toBe(true); // as before: the game-over screen is up
  });
});
