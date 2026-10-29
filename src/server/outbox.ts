import { storage } from '../core/storage';
import { dayKey } from '../economy/time';
import { weekKey } from '../progression/leagues';
import type { Backend, RunSubmission, SubmitResult } from './backend';

// Runs waiting to reach the server. A phone loses signal mid-commute, so a run
// is written down first and sent after: it stays here until the server takes it
// or turns it down for good. Kept on the device only (never in the cloud save).

const OUTBOX_KEY = 'endless.outbox';
const MAX_WAITING = 30; // a long offline spell keeps the best of what's left, not everything
const MAX_TRIES = 8; // then it's not going to work: let it go
/** submit_run takes one run every 8 seconds from a player: a run turned away for that is sent again after this (ms), and it isn't a failed try. */
export const RATE_GAP_MS = 9000;

interface Waiting {
  run: RunSubmission;
  tries: number;
}

export class Outbox {
  private items: Waiting[] = [];
  private loaded = false;
  private flushing: Promise<[RunSubmission, SubmitResult][]> | null = null;
  private again = 0;
  /** How a run went that was sent again later by itself (the rate limit), for the notice its send() couldn't give. */
  onLate: ((run: RunSubmission, result: SubmitResult) => void) | null = null;

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

  private sendAgainSoon(): void {
    if (this.again) return;
    this.again = setTimeout(() => {
      this.again = 0;
      void this.flush().then((sent) => {
        for (const [run, res] of sent) if (res.status !== 'retry') this.onLate?.(run, res);
      });
    }, RATE_GAP_MS) as unknown as number;
  }

  private async run(): Promise<[RunSubmission, SubmitResult][]> {
    await this.load();
    const results: [RunSubmission, SubmitResult][] = [];
    if (!this.backend.online) return results;
    while (this.items.length > 0) {
      const next = this.items[0];
      // A daily run that waited past midnight: the board it was for is closed (the server would file it under the new day's).
      // Likewise a ranked run once the week has turned: last week's course on this week's board.
      const now = this.backend.now();
      if (
        (next.run.board === 'daily' && next.run.day && next.run.day !== dayKey(now)) ||
        (next.run.board === 'ranked' && next.run.week && next.run.week !== weekKey(now))
      ) {
        this.items.shift();
        this.save();
        continue;
      }
      const res = await this.backend.submitRun(next.run);
      results.push([next.run, res]);
      if (res.status === 'retry') {
        // Too soon after the last run (a backlog, or a quick retry): the server will take it in a moment.
        if (/too quickly/.test(res.message ?? '')) this.sendAgainSoon();
        else {
          next.tries++;
          if (next.tries >= MAX_TRIES) this.items.shift();
        }
        this.save();
        break;
      }
      this.items.shift(); // taken, or turned down for good
      this.save();
    }
    return results;
  }
}
