import { type BufferGeometry, Mesh, MeshBasicMaterial, type Scene } from 'three';
import { CONFIG } from './config';
import type { LivePalette } from './palette';
import { storage } from './storage';
import { terrain } from './terrain';

// The ghost: your best run on this week's ranked level, flown alongside you
// as a faint ship. A run is recorded as the ship's sideways position and the
// time, every `step` units along the course.

export interface GhostRun {
  week: string;
  step: number;
  xs: number[]; // world x at each step
  ts: number[]; // seconds into the run at each step
}

const KEY = 'endless.ghost';

export class Ghost {
  private run: GhostRun | null = null;
  private readonly mesh: Mesh;
  private readonly mat: MeshBasicMaterial;
  private on = false;

  constructor(scene: Scene, geometry: BufferGeometry, private readonly palette: LivePalette) {
    this.mat = new MeshBasicMaterial({ transparent: true, opacity: 0.28, depthWrite: false });
    this.mesh = new Mesh(geometry, this.mat);
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  async load(): Promise<void> {
    const raw = await storage.get(KEY);
    if (!raw) return;
    try {
      this.run = JSON.parse(raw) as GhostRun;
    } catch {
      this.run = null;
    }
  }

  /** Keep `run` as the week's best. */
  save(run: GhostRun): void {
    this.run = run;
    void storage.set(KEY, JSON.stringify(run));
  }

  /** Fly the ghost this run if there's one for `week`. */
  start(week: string | null, enabled: boolean): void {
    this.on = enabled && week !== null && this.run?.week === week && this.run.ts.length > 1;
    this.mesh.visible = false;
  }

  stop(): void {
    this.on = false;
    this.mesh.visible = false;
  }

  /** Place the ghost for `seconds` into the run; the player is at `distance` (from the run start) and world x `shipX`. */
  update(seconds: number, distance: number, runStart: number, shipX: number): void {
    const r = this.run;
    if (!this.on || !r) return;
    const ts = r.ts;
    if (seconds >= ts[ts.length - 1]) {
      this.mesh.visible = false; // its run ended here
      return;
    }
    // Binary search for the step the ghost is on at this time.
    let lo = 0;
    let hi = ts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ts[mid] <= seconds) lo = mid;
      else hi = mid;
    }
    const f = ts[hi] > ts[lo] ? Math.max(0, Math.min(1, (seconds - ts[lo]) / (ts[hi] - ts[lo]))) : 0;
    const d = (lo + f) * r.step; // along the run
    const x = r.xs[lo] + (r.xs[hi] - r.xs[lo]) * f;
    const ahead = d - distance;
    // Only when it's near: far ahead or behind it would just be a speck.
    this.mesh.visible = ahead > -6 && ahead < 120;
    if (!this.mesh.visible) return;
    const wd = runStart + d;
    const h = terrain.active ? terrain.heightAtX(wd, x) - terrain.heightAtX(runStart + distance, shipX) : 0;
    this.mesh.position.set(x - shipX, CONFIG.ship.hoverY + h, -ahead);
    this.mat.color.copy(this.palette.text);
  }
}
