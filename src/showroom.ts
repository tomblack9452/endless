// The showroom camera's turn: a slow automatic spin round the ship, which the
// player can grab and drag. A flick carries on and slows; a few seconds after
// letting go the spin eases back in from wherever the ship was left, so the
// angle never jumps.

/** The fastest a flick can throw the ship, radians a second. */
const MAX_FLICK = 9;

export interface ShowroomSpinOptions {
  /** The automatic spin, radians a second. */
  spin: number;
  /** Radians the camera turns for each pixel dragged. */
  perPx?: number;
  /** Seconds after the last touch before the spin comes back. */
  resumeAfter?: number;
  /** Seconds the spin takes to get back up to speed. */
  easeIn?: number;
  /** How quickly a flick slows (higher stops sooner). */
  friction?: number;
}

export class ShowroomSpin {
  /** Radians the camera turns for each pixel dragged (set from the screen width). */
  perPx: number;
  private readonly spin: number;
  private readonly resumeAfter: number;
  private readonly easeIn: number;
  private readonly friction: number;
  private angle = 0;
  private velocity = 0; // the flick, radians a second
  private moved = 0; // dragged since the last update
  private holding = false;
  private idle = Infinity; // seconds since the last touch

  constructor(o: ShowroomSpinOptions) {
    this.spin = o.spin;
    this.perPx = o.perPx ?? 0.008;
    this.resumeAfter = o.resumeAfter ?? 3;
    this.easeIn = o.easeIn ?? 1.2;
    this.friction = o.friction ?? 4;
  }

  /** The finger moved `dx` pixels sideways (right is positive): the ship turns with it. */
  drag(dx: number): void {
    const da = -dx * this.perPx; // grab the near side and push it: the camera goes the other way
    this.angle += da;
    this.moved += da;
    this.holding = true;
    this.idle = 0;
  }

  /** The finger lifted: the flick carries on, and the wait for the spin starts. */
  release(): void {
    this.holding = false;
    this.idle = 0;
  }

  /** Is the player holding the ship? */
  get held(): boolean {
    return this.holding;
  }

  /** The automatic spin's share now, 0 (paused) to 1 (full speed). */
  get autoShare(): number {
    if (this.holding) return 0;
    const k = Math.max(0, Math.min(1, (this.idle - this.resumeAfter) / this.easeIn));
    return k * k * (3 - 2 * k);
  }

  /** Step on `dt` seconds; returns the camera's angle round the ship (radians). */
  update(dt: number): number {
    if (dt <= 0) return this.angle;
    if (this.holding) {
      // Follow the finger's speed (smoothed), so letting go mid-swipe throws the ship on.
      const v = Math.max(-MAX_FLICK, Math.min(MAX_FLICK, this.moved / dt));
      this.velocity += (v - this.velocity) * Math.min(1, dt * 18);
      this.moved = 0;
      return this.angle;
    }
    this.moved = 0;
    this.angle += this.velocity * dt;
    this.velocity *= Math.exp(-this.friction * dt);
    if (Math.abs(this.velocity) < 1e-3) this.velocity = 0;
    this.idle += dt;
    this.angle += this.spin * this.autoShare * dt;
    return this.angle;
  }
}
