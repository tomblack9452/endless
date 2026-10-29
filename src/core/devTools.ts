import { CONFIG } from './config';
import type { RoomId } from '../world/interior';
import type { Game } from './game';

export class DevTools {
  constructor(private readonly g: Game) {}

  /** Dev: renderer stats for the FPS readout. */
  devStats(): { ratio: number; calls: number; triangles: number; textures: number; geometries: number; low: boolean } {
    const info = this.g.stage.renderer.info;
    return {
      ratio: this.g.stage.pixelRatio,
      calls: info.render.calls,
      triangles: info.render.triangles,
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      low: this.g.lowGraphics(),
    };
  }

  /** Dev: force every interior room to be `id` (null = random). */
  devSetRoom(id: RoomId | null): void {
    this.g.world.devRoom = id;
  }

  /** Dev: build this hand-made section everywhere it fits (null: as normal). */
  devSetPiece(id: string | null): void {
    this.g.world.devPieces = id ? [id] : [];
  }

  /** Dev: draw sections' routes on the floor. */
  devShowRoutes(on: boolean): void {
    this.g.world.showRoutes = on;
  }

  /** Dev: unlock everything: top rank, every sector and star, all looks and upgrades, plenty of credits. */
  devUnlockAll(): void {
    this.g.maxOut();
    this.g.ui.showNotice('dev: everything unlocked');
  }

  /** Dev: cores, standing in for purchases until the store is in. */
  /** Dev: premium on or off (as if bought, or never bought). */
  devTogglePremium(): boolean {
    if (this.g.entitlements.has('premium')) this.g.entitlements.clear();
    else this.g.entitlements.grant('premium');
    this.g.applyLooks();
    this.g.title.refreshTitle();
    return this.g.entitlements.has('premium');
  }

  devAddCores(n: number): void {
    this.g.wallet.addCores(n);
    this.g.econ.bump('cores');
    this.g.title.refreshTitle();
  }

  /** Dev: replay the last run's course from where it started (same seed). */
  devReplay(): void {
    this.g.beginRun(this.devStart, this.g.seed);
  }

  private devStart = 0;

  /** Dev: start a run a little before `level` begins. */
  devStartAt(level: number): void {
    const lead = 60; // points before the level starts, so you see the change
    this.devStart = Math.max(0, (level - 1) * CONFIG.score.levelLength - lead);
    this.g.beginRun(this.devStart);
  }
}
