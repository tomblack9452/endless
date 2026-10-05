import { CONFIG } from './config';

// One interface for all steering sources. steering() returns -1 (left) .. 1 (right).
// Priority: drag (while a finger is down) > keyboard > tilt.
//
// Tilt uses the device orientation's gamma (left/right lean in portrait),
// measured from a neutral angle captured by calibrate() at the start of each
// run and on resume, with a small deadzone. iOS only sends orientation after
// a permission prompt answered from a tap; phones also need HTTPS.

export class Input {
  private dragging = false;
  private pointerId = -1;
  private anchorX = 0;
  private dragValue = 0;

  private left = false;
  private right = false;
  private keyValue = 0;

  private boostKey = false;
  private boostPointer = -1;
  /** Double-tap and hold: the press that's boosting, and the last quick tap. */
  doubleTapBoost = true;
  private tapBoostPointer = -1;
  private downAt = 0;
  private downX = 0;
  private downY = 0;
  private moved = false;
  private lastTapAt = -Infinity;
  private lastTapX = 0;
  private lastTapY = 0;

  enabled = false;
  /** Touch steering: false = drag anywhere, true = hold the left or right side. */
  sidesMode = false;
  private sideDir = 0;
  private sideValue = 0;
  /** Tilt settings. */
  tiltEnabled = true;
  tiltSensitivity = 1;
  /** Called if the player declines motion access (so the game can say drag still works). */
  onTiltDenied: (() => void) | null = null;
  private tiltRaw = 0;
  private tiltNeutral = 0;
  private tiltValue = 0;
  private tiltSeen = false;
  private tiltAsked = false;
  /** Finger travel for full steer, as a fraction of screen width (steering setting). */
  dragRange: number = CONFIG.steering.dragRangeFraction;

  constructor(target: HTMLElement) {
    target.addEventListener('pointerdown', this.onDown);
    target.addEventListener('pointermove', this.onMove);
    target.addEventListener('pointerup', this.onUp);
    target.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
    // Always listen; where the browser gates motion behind a permission
    // prompt (iOS, some others) also ask on the first tap.
    window.addEventListener('deviceorientation', this.onOrient);
    const gated = typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission === 'function';
    if (gated) {
      const ask = () => this.requestTilt();
      window.addEventListener('click', ask);
      window.addEventListener('touchend', ask);
    }
  }

  /** iOS: ask for motion access. Must run inside a tap (click/touchend). */
  private requestTilt(): void {
    if (this.tiltAsked || !this.tiltEnabled) return;
    this.tiltAsked = true;
    const req = (DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission;
    req()
      .then((state) => {
        if (state !== 'granted') this.onTiltDenied?.();
      })
      .catch(() => this.onTiltDenied?.());
  }

  /** Take the current lean as straight ahead. */
  calibrate(): void {
    this.tiltNeutral = this.tiltRaw;
    this.tiltValue = 0;
  }

  private onOrient = (e: DeviceOrientationEvent): void => {
    if (e.gamma === null) return;
    // Upside-down portrait reverses left and right.
    const angle = screen.orientation?.angle ?? 0;
    this.tiltRaw = angle === 180 ? -e.gamma : e.gamma;
    if (!this.tiltSeen) {
      this.tiltSeen = true;
      this.tiltNeutral = this.tiltRaw;
    }
  };

  update(dt: number): void {
    const want = (this.right ? 1 : 0) - (this.left ? 1 : 0);
    const ramp = CONFIG.steering.keyRamp * dt;
    if (want === 0) this.keyValue = 0;
    else this.keyValue = clamp(this.keyValue + want * ramp, -1, 1);
    // Tap-sides mode ramps like the keys while a side is held.
    if (this.sideDir === 0) this.sideValue = 0;
    else this.sideValue = clamp(this.sideValue + this.sideDir * ramp, -1, 1);

    if (this.tiltSeen) {
      const T = CONFIG.steering.tilt;
      let lean = this.tiltRaw - this.tiltNeutral;
      lean = Math.abs(lean) < T.deadzoneDeg ? 0 : lean - Math.sign(lean) * T.deadzoneDeg;
      const target = clamp((lean * this.tiltSensitivity) / T.fullTiltDeg, -1, 1);
      this.tiltValue += (target - this.tiltValue) * (1 - Math.exp(-T.smoothing * dt));
    }
  }

  steering(): number {
    if (!this.enabled) return 0;
    if (this.dragging) return this.sidesMode ? this.sideValue : this.dragValue;
    if (this.keyValue !== 0) return this.keyValue;
    if (this.tiltEnabled && this.tiltSeen) return this.tiltValue;
    return 0;
  }

  /** True while boost is held (boost control, Shift, W, Up or Space). */
  boostHeld(): boolean {
    return this.enabled && (this.boostKey || this.boostPointer !== -1 || this.tapBoostPointer !== -1);
  }

  /** Make `el` a hold-to-boost control. Touches on it never steer. */
  bindBoostControl(el: HTMLElement): void {
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.boostPointer = e.pointerId;
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId === this.boostPointer) this.boostPointer = -1;
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  }

  releaseAll = (): void => {
    this.dragging = false;
    this.pointerId = -1;
    this.dragValue = 0;
    this.sideDir = 0;
    this.left = this.right = false;
    this.keyValue = 0;
    this.boostKey = false;
    this.boostPointer = -1;
    this.tapBoostPointer = -1;
    this.lastTapAt = -Infinity;
  };

  private range(): number {
    return Math.max(30, window.innerWidth * this.dragRange);
  }

  private onDown = (e: PointerEvent): void => {
    if (this.dragging) return;
    // The second press of a quick double-tap boosts while held; it steers as normal too.
    const T = CONFIG.boost.doubleTap;
    const now = e.timeStamp;
    if (this.doubleTapBoost && now - this.lastTapAt <= T.gapMs && Math.hypot(e.clientX - this.lastTapX, e.clientY - this.lastTapY) <= T.slopPx) {
      this.tapBoostPointer = e.pointerId;
    }
    this.lastTapAt = -Infinity;
    this.downAt = now;
    this.downX = e.clientX;
    this.downY = e.clientY;
    this.moved = false;
    this.dragging = true;
    this.pointerId = e.pointerId;
    this.anchorX = e.clientX;
    this.dragValue = 0;
    this.sideDir = e.clientX < window.innerWidth / 2 ? -1 : 1;
    this.sideValue = 0;
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > CONFIG.boost.doubleTap.slopPx / 3) this.moved = true;
    const range = this.range();
    let offset = e.clientX - this.anchorX;
    // Drag the anchor along past full lock so reversing direction responds at once.
    if (offset > range) {
      this.anchorX = e.clientX - range;
      offset = range;
    } else if (offset < -range) {
      this.anchorX = e.clientX + range;
      offset = -range;
    }
    this.dragValue = offset / range;
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId === this.tapBoostPointer) this.tapBoostPointer = -1;
    if (e.pointerId !== this.pointerId) return;
    // A short press that barely moved is a tap: the first half of a double-tap.
    if (!this.moved && e.timeStamp - this.downAt <= CONFIG.boost.doubleTap.tapMs) {
      this.lastTapAt = e.timeStamp;
      this.lastTapX = e.clientX;
      this.lastTapY = e.clientY;
    }
    this.dragging = false;
    this.pointerId = -1;
    this.dragValue = 0;
    this.sideDir = 0;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.left = true;
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.right = true;
    else if (BOOST_KEYS.has(e.code)) this.boostKey = true;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.left = false;
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.right = false;
    else if (BOOST_KEYS.has(e.code)) this.boostKey = false;
  };
}

const BOOST_KEYS = new Set(['ShiftLeft', 'ShiftRight', 'KeyW', 'ArrowUp', 'Space']);

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
