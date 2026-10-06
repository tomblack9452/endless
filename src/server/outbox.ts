import { storage } from '../storage';
import type { Backend, RunSubmission, SubmitResult } from './backend';

// Runs waiting to reach the server. A phone loses signal mid-commute, so a run
// is written down first and sent after: it stays here until the server takes it
// or turns it down for good. Kept on the device only (never in the cloud save).

const OUTBOX_KEY = 'endless.outbox';
const MAX_WAITING = 30; // a long offline spell keeps the best of what's left, not everything
const MAX_TRIES = 8; // then it's not going to work: let it go

interface Waiting {
  run: RunSubmission;
  tries: number;
}

export class Outbox {
  private items: Waiting[] = [];
  private loaded = false;
  private flushing: Promise<[RunSubmission, SubmitResult][]> | null = null;

  constructor(private readonly backend: Backend) {}

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await storage.get(OUTBOX_KEY);
      if (raw) this.items = JSON.parse(raw) as Waiting[];
    } catch {
      this.items = [];
    }
  }

  private save(): void {
    void storage.set(OUTBOX_KEY, JSON.stringify(this.items));
  }

  get waiting(): number {
    return this.items.length;
  }

  /** Write a run down and try to send everything waiting. Resolves with how this run went, or null if it's still waiting. */
  async send(run: RunSubmission): Promise<SubmitResult | null> {
    await this.load();
    this.items.push({ run, tries: 0 });
    // Keep the best few per board if it's piled up.
    if (this.items.length > MAX_WAITING) {
      this.items.sort((a, b) => b.run.score - a.run.score);
      this.items.length = MAX_WAITING;
    }
    this.save();
    const sent = await this.flush();
    return sent.find(([r]) => r === run)?.[1] ?? null;
  }

  /** Try everything waiting, oldest first, in turn. Stops at the first "try later" (no signal won't improve mid-list). */
  flush(): Promise<[RunSubmission, SubmitResult][]> {
    if (this.flushing) return this.flushing;
    this.flushing = this.run().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async run(): Promise<[RunSubmission, SubmitResult][]> {
    await this.load();
    const results: [RunSubmission, SubmitResult][] = [];
    if (!this.backend.online) return results;
    while (this.items.length > 0) {
      const next = this.items[0];
      const res = await this.backend.submitRun(next.run);
      results.push([next.run, res]);
      if (res.status === 'retry') {
        next.tries++;
        if (next.tries >= MAX_TRIES) this.items.shift();
        this.save();
        break;
      }
      this.items.shift(); // taken, or turned down for good
      this.save();
    }
    return results;
  }
}
