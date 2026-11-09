import { describe, expect, it } from 'vitest';
import { premiumUpTo } from '../src/economy/pass';
import { REVIEW, reviewDue } from '../src/platform/review';
import { wouldHave } from '../src/screens/shop';
import { clubUntil } from '../src/store/store';

const DAY = 86_400_000;

describe('asking for a rating', () => {
  it('asks after a new best once there have been a few runs, then not again for 60 days', () => {
    const now = 1000 * DAY;
    expect(reviewDue({ newBest: false, runs: 50, lastAsked: null, now })).toBe(false);
    expect(reviewDue({ newBest: true, runs: REVIEW.afterRuns - 1, lastAsked: null, now })).toBe(false);
    expect(reviewDue({ newBest: true, runs: REVIEW.afterRuns, lastAsked: null, now })).toBe(true);
    expect(reviewDue({ newBest: true, runs: 50, lastAsked: now - 10 * DAY, now })).toBe(false);
    expect(reviewDue({ newBest: true, runs: 50, lastAsked: now - 60 * DAY, now })).toBe(true);
  });
});

describe("the pilot's club", () => {
  const now = 1000 * DAY;
  it("runs until the latest expiry among the club's ids", () => {
    const later = new Date(now + 20 * DAY).toISOString();
    expect(
      clubUntil(
        { activeSubscriptions: ['pilots_club:monthly'], allExpirationDates: { 'pilots_club:monthly': later, other: new Date(now + 90 * DAY).toISOString() } },
        now,
      ),
    ).toBe(Date.parse(later));
  });

  it('is over once the expiry has passed, and a day at a time when the store gives none', () => {
    expect(clubUntil({ activeSubscriptions: [], allExpirationDates: { pilots_club: new Date(now - DAY).toISOString() } }, now)).toBeNull();
    expect(clubUntil({ activeSubscriptions: ['pilots_club'], allExpirationDates: {} }, now)).toBe(now + DAY);
  });
});

describe('what premium would have given', () => {
  it('adds up the premium tiers already reached', () => {
    const w = premiumUpTo(10, 1);
    expect(w.looks).toBe(1); // tier 10's look
    expect(w.cores).toBe(20 + 15 * 3); // tier 5, and 3, 6, 9
    expect(wouldHave(10, 1)).toMatch(/^premium would have given you [\d,]+ credits, 65 cores and a look so far$/);
    expect(wouldHave(2, 1)).toMatch(/^premium would have given you [\d,]+ credits so far$/);
  });
});
