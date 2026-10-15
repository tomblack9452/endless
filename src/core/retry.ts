// When a tap after a crash flies again. Normally the game-over screen comes up
// and a tap retries once the retry lock has passed (CONFIG.crash.retryLockMs),
// so a finger still on the screen from steering can't restart by accident.
// Quick retry (a setting, off by default) leaves out the game-over screen: one
// tap restarts, outside ranked and the tutorial, once any revive offer is
// settled. Rewards and records are granted exactly as without it.

/** Quick retry applies to this crash. */
export function quickRetryOn(setting: boolean, mode: string, practising: boolean): boolean {
  return setting && mode !== 'ranked' && !practising;
}

export interface RetryTap {
  /** Since the crash. */
  crashMs: number;
  /** crashMs when the run was settled (0 straight away; later once a revive offer is turned down). */
  settledMs: number;
  revivePending: boolean;
  offerOpen: boolean;
  quick: boolean;
  lockMs: number;
}

/** True if a tap now restarts the run. */
export function tapRetries(t: RetryTap): boolean {
  if (t.revivePending || t.offerOpen || t.crashMs < t.lockMs) return false;
  // Quick retry: the lock runs again from the offer's answer, so a tap just after it can't restart by accident.
  return !t.quick || t.crashMs - t.settledMs >= t.lockMs;
}
