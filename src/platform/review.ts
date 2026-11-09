import { Capacitor } from '@capacitor/core';
import { storage } from '../core/storage';
import { analytics } from './analytics';

// Asking for a Play Store rating with Google's own in-app review sheet. Only
// at a good moment (a new best), never early, and rarely: Google also decides
// on its own whether the sheet shows, and never says whether it did.

export const REVIEW = { afterRuns: 8, everyDays: 60 };
const KEY = 'endless.reviewAsked';

/** Whether to ask now: a new best, after a few runs, at most once every 60 days. */
export function reviewDue(o: { newBest: boolean; runs: number; lastAsked: number | null; now: number }): boolean {
  if (!o.newBest || o.runs < REVIEW.afterRuns) return false;
  return o.lastAsked === null || o.now - o.lastAsked >= REVIEW.everyDays * 86_400_000;
}

/** After a new best in the Android app: ask for a rating, if it's time. */
export async function maybeAskReview(newBest: boolean, runs: number, now: number): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  const last = Number(await storage.get(KEY)) || null;
  if (!reviewDue({ newBest, runs, lastAsked: last, now })) return;
  await storage.set(KEY, String(now));
  analytics.log('review_asked', { runs });
  try {
    const { InAppReview } = await import('@capacitor-community/in-app-review');
    await InAppReview.requestReview();
  } catch {
    // No Play Store on this device: nothing to ask.
  }
}
