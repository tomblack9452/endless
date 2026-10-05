import { storage } from './storage';

// Credits: earned by every run (ranked and daily at full rate, solo at half),
// promotions and sector stars; spent in the hangar on upgrades and looks.

const KEY = 'endless.wallet';

export class Wallet {
  credits = 0;
  earned = 0; // lifetime, for the service record

  async load(): Promise<void> {
    const raw = await storage.get(KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as { credits?: number; earned?: number };
      this.credits = s.credits ?? 0;
      this.earned = s.earned ?? this.credits;
    } catch {
      // Corrupt value: start fresh.
    }
  }

  private save(): void {
    void storage.set(KEY, JSON.stringify({ credits: this.credits, earned: this.earned }));
  }

  add(n: number): void {
    if (n <= 0) return;
    this.credits += n;
    this.earned += n;
    this.save();
  }

  /** Spend `n` if there's enough; returns whether it went through. */
  spend(n: number): boolean {
    if (n > this.credits) return false;
    this.credits -= n;
    this.save();
    return true;
  }
}
