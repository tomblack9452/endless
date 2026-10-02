import { storage } from './storage';

// One-off hints for new players. Each shows once ever; seen flags are saved.
// Only one shows at a time: if another is still on screen, the hint waits for
// its next trigger.

export type HintId = 'steer' | 'boost' | 'nearMiss' | 'pickup' | 'pits';

const KEY = 'endless.hints';
const SHOW_MS = 3600;

const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

const TEXT: Record<HintId, string> = {
  steer: touch ? 'drag or tilt to steer' : 'arrows or a / d to steer',
  boost: touch ? 'hold the bottom right corner to boost' : 'hold shift to boost',
  nearMiss: 'near miss. chain them for more points',
  pickup: 'pickups fill your boost',
  pits: 'gaps in the floor. stay over the deck',
};

export class Hints {
  private seen = new Set<HintId>();
  private busyUntil = 0;

  constructor(private readonly show: (text: string) => void) {
    void storage.get(KEY).then((raw) => {
      if (!raw) return;
      try {
        for (const id of JSON.parse(raw) as HintId[]) this.seen.add(id);
      } catch {
        // Corrupt value: show the hints again.
      }
    });
  }

  /** Show hint `id` if it hasn't been seen and nothing else is showing. */
  offer(id: HintId): void {
    if (this.seen.has(id)) return;
    const now = performance.now();
    if (now < this.busyUntil) return;
    this.seen.add(id);
    this.busyUntil = now + SHOW_MS;
    this.show(TEXT[id]);
    void storage.set(KEY, JSON.stringify([...this.seen]));
  }
}
