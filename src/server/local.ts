import type { Backend, BoardQuery, BoardRow, LinkResult, RunSubmission, SubmitResult } from './backend';

// No server: the device is the only record. Boards can't be read, so the
// leaderboard screen shows your own bests and says why.

export class LocalBackend implements Backend {
  readonly online = false;
  readonly userId = null;
  readonly clockKnown = false;

  now(): number {
    return Date.now(); // no server: the device's clock is the only one
  }

  async syncClock(): Promise<boolean> {
    return false;
  }

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

  async syncCredits(): Promise<null> {
    return null;
  }

  async takeMaxOut(): Promise<boolean> {
    return false;
  }

  async setShip(): Promise<boolean> {
    return false;
  }

  async setRecord(): Promise<boolean> {
    return false;
  }

  async pilotRecord(): Promise<null> {
    return null;
  }

  readonly authError = '';

  async googleAccount(): Promise<string | null> {
    return null;
  }

  async linkGoogle(): Promise<LinkResult> {
    return 'failed';
  }

  async signInGoogle(): Promise<boolean> {
    return false;
  }

  async deleteAccount(): Promise<boolean> {
    return true; // nothing held anywhere but this device
  }

  async setPilotName(): Promise<{ ok: boolean; message: string }> {
    return { ok: false, message: 'names need the server' };
  }
}
