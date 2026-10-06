import { storage } from '../storage';
import type { Backend } from './backend';

// Cloud save: every "endless." key (except the session and the outbox) as one row.
// On start, the newer of the device and the cloud wins; a fresh install with
// a cloud save takes it and reloads. A device that played before cloud saves
// existed keeps whichever save has earned more credits in its lifetime.

const PREFIX = 'endless.';
const SAVED_AT = 'endless.savedAt';
const SKIP = new Set(['endless.session', 'endless.outbox', SAVED_AT]);

function lifetimeCredits(data: Record<string, string>): number {
  try {
    return (JSON.parse(data['endless.wallet'] ?? '{}') as { earned?: number }).earned ?? 0;
  } catch {
    return 0;
  }
}

async function snapshot(): Promise<Record<string, string>> {
  const all = await storage.entries(PREFIX);
  for (const k of SKIP) delete all[k];
  return all;
}

export class CloudSave {
  private timer = 0;

  constructor(private readonly backend: Backend) {}

  /**
   * Compare with the cloud. Returns true if the cloud save was taken (the
   * caller reloads so everything starts from it).
   */
  async start(): Promise<boolean> {
    if (!this.backend.online) return false;
    const remote = await this.backend.loadSave();
    const local = await snapshot();
    const localAt = Number((await storage.get(SAVED_AT)) ?? 0) || 0;
    const takeRemote = remote !== null && (localAt > 0 ? remote.savedAt > localAt : lifetimeCredits(remote.data) > lifetimeCredits(local));
    if (remote && takeRemote) {
      for (const [k, v] of Object.entries(remote.data)) if (!SKIP.has(k)) await storage.set(k, v);
      await storage.set(SAVED_AT, String(remote.savedAt));
      return true;
    }
    this.push();
    return false;
  }

  /** Save to the cloud a moment after things settle (runs, purchases). */
  push(): void {
    if (!this.backend.online) return;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      void (async () => {
        const at = Date.now();
        await storage.set(SAVED_AT, String(at));
        await this.backend.pushSave(await snapshot(), at);
      })();
    }, 4000);
  }
}
