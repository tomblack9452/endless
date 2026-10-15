import { CONFIG } from '../core/config';
import { storage } from '../core/storage';
import type { Reward } from '../economy/reward';
import { dayBefore } from '../economy/time';

// The daily challenge on this device: today's best, today's tries, and the
// streak (days in a row with a daily run). Days are UTC dates from the trusted
// clock (backend.now()), so moving the phone's clock on doesn't add a day.
//
//   streak     a run on the day after the last one adds a day; a run on the
//              same day changes nothing; a missed day starts again at 1
//   counts     a run has to last a few seconds (or finish) to keep the streak
//   reward     the first run of each day in the streak pays the ladder's step
//              (CONFIG.daily.streak, the last step from day 7 on); cores go
//              through earn_cores as 'daily:<date>'
//   clock back a day before the last one played (the phone's clock, offline)
//              is kept for nothing: no best, no streak, no reward

const KEY = 'endless.challenge';

/** What a streak of `days` pays on the day it's reached. */
export function streakReward(days: number): Reward {
  const ladder = CONFIG.daily.streak;
  const step = ladder[Math.max(0, Math.min(ladder.length, days) - 1)];
  return { ...step };
}

/** The streak after a run on `day`, given the last day played and the streak then. */
export function nextStreak(last: string, streak: number, day: string): number {
  if (!last || streak <= 0) return 1;
  if (day === last) return streak;
  if (day < last) return streak; // the clock went back: as it was
  return dayBefore(day) === last ? streak + 1 : 1;
}

export interface ChallengeResult {
  /** A new best for the day. */
  isNew: boolean;
  best: number;
  streak: number;
  /** The streak's reward, on the first run of a new day in it (null otherwise). */
  reward: Reward | null;
}

export class Challenge {
  /** The day `best` and `tries` belong to. */
  day = '';
  best = 0;
  tries = 0;
  streak = 0;
  /** The last day a daily run was flown. */
  last = '';
  /** The best streak ever (the service record). */
  longest = 0;

  async load(): Promise<void> {
    const raw = await storage.get(KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as Partial<Challenge>;
      this.day = typeof s.day === 'string' ? s.day : '';
      this.best = Number(s.best) || 0;
      this.tries = Number(s.tries) || 0;
      this.streak = Number(s.streak) || 0;
      this.last = typeof s.last === 'string' ? s.last : '';
      this.longest = Number(s.longest) || this.streak;
    } catch {
      // Corrupt value: start fresh.
    }
  }

  private save(): void {
    void storage.set(KEY, JSON.stringify({ day: this.day, best: this.best, tries: this.tries, streak: this.streak, last: this.last, longest: this.longest }));
  }

  /** Today's best (0 if the one kept is another day's). */
  bestOn(day: string): number {
    return this.day === day ? this.best : 0;
  }

  /** Flown today already. */
  playedOn(day: string): boolean {
    return this.last === day;
  }

  /** The streak as it stands on `day`: alive if the last run was today or yesterday, else 0. */
  streakOn(day: string): number {
    return this.last === day || this.last === dayBefore(day) ? this.streak : 0;
  }

  /**
   * A daily run on `day` scoring `score`. Returns its best, the streak and any
   * reward to pay. `counts` false (a crash in the first seconds): a try and a
   * score, but not a day in the streak.
   */
  record(day: string, score: number, counts = true): ChallengeResult {
    if (this.last && day < this.last) return { isNew: false, best: this.bestOn(this.last), streak: this.streak, reward: null };
    if (this.day !== day) {
      this.day = day;
      this.best = 0;
      this.tries = 0;
    }
    this.tries++;
    const isNew = Math.floor(score) > this.best;
    if (isNew) this.best = Math.floor(score);
    if (!counts) {
      this.save();
      return { isNew, best: this.best, streak: this.streakOn(day), reward: null };
    }
    const newDay = this.last !== day;
    this.streak = nextStreak(this.last, this.streak, day);
    this.last = day;
    this.longest = Math.max(this.longest, this.streak);
    this.save();
    return { isNew, best: this.best, streak: this.streak, reward: newDay ? { ...streakReward(this.streak), source: `daily:${day}` } : null };
  }
}
