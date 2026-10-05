import type { Backend, BoardRow, RunSubmission } from './backend';

// No server: the device is the only record. The leaderboard shows your own
// best of the week, so the screen still makes sense offline.

export class LocalBackend implements Backend {
  readonly online = false;
  private best = new Map<string, number>(); // week:league -> best score this session

  async signIn(): Promise<boolean> {
    return false;
  }

  async loadSave(): Promise<null> {
    return null;
  }

  async pushSave(): Promise<void> {}

  async cores(): Promise<null> {
    return null;
  }

  async earnCores(): Promise<void> {}

  async spendCores(): Promise<boolean> {
    return true; // the device's wallet already checked
  }

  async submitRun(run: RunSubmission): Promise<void> {
    const k = `${run.week}:${run.league}`;
    this.best.set(k, Math.max(this.best.get(k) ?? 0, Math.floor(run.score)));
  }

  async board(week: string, league: number): Promise<BoardRow[]> {
    const score = this.best.get(`${week}:${league}`);
    return score ? [{ name: 'you', score, you: true }] : [];
  }
}
