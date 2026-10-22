import { CONFIG } from './config';

/**
 * Graphics on auto: watches frame times during a run and says, once, when
 * they have stayed above the target long enough that low graphics would help.
 * Stalls (a tab switch, a GC pause) are ignored, and it never fires twice.
 */
export class AutoGraphics {
  private avg = 16.7;
  private slowFor = 0;
  private done = false;

  /** True when the drop already happened (it only happens once per session). */
  get dropped(): boolean {
    return this.done;
  }

  /** Feed one frame's time; returns true on the one frame that should switch to low. */
  feed(frameMs: number): boolean {
    const A = CONFIG.render.auto;
    if (this.done || frameMs > A.stallMs || frameMs <= 0) return false;
    this.avg += (frameMs - this.avg) * 0.05;
    this.slowFor = this.avg > A.slowFrameMs ? this.slowFor + frameMs : 0;
    if (this.slowFor < A.slowForMs) return false;
    this.done = true;
    return true;
  }

  /** Off a run the count starts again, so only sustained slow play counts. */
  reset(): void {
    this.avg = 16.7;
    this.slowFor = 0;
  }
}
