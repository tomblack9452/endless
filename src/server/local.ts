import type { Backend, BoardQuery, BoardRow, RunSubmission, SubmitResult } from './backend';

// No server: the device is the only record. Boards can't be read, so the
// leaderboard screen shows your own bests and says why.

export class LocalBackend implements Backend {
  readonly online = false;
  readonly userId = null;

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

  async submitRun(_run: RunSubmission): Promise<SubmitResult> {
    return { status: 'ok' };
  }

  async board(_query: BoardQuery): Promise<BoardRow[] | null> {
    return null;
  }

  async purchases(): Promise<null> {
    return null;
  }

  async pilotName(): Promise<null> {
    return null;
  }

  async setPilotName(): Promise<{ ok: boolean; message: string }> {
    return { ok: false, message: 'names need the server' };
  }
}
