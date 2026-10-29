import { CONFIG } from './config';
import { itemCard, powerItem } from '../ui/guide';
import type { PowerKind } from '../world/world';
import type { Game } from './game';

export class Powers {
  constructor(private readonly g: Game) {}

  private magnetT = 0;

  private slowT = 0;

  gainPower(kind: PowerKind): void {
    const p = CONFIG.powers;
    if (kind === 0) {
      this.g.shield = true;
      this.g.player.setShield(true);
    } else if (kind === 1) this.magnetT = p.magnet.seconds + this.g.ship.magnetExtra;
    else if (kind === 2) this.slowT = p.slow.seconds;
    else if (kind === 3) this.g.phaseT = p.phase.seconds;
    else this.g.doubleT = p.double.seconds;
    this.g.pickupCount++;
    if (this.g.practice)
      this.g.firstLaunch.practiceGot(kind); // the lesson card says it
    else this.g.ui.showNotice(itemCard(powerItem(kind)).on);
    this.g.sound.power();
    this.g.haptics.pickup();
  }

  updatePowers(dt: number): void {
    this.g.graceT = Math.max(0, this.g.graceT - dt);
    this.g.phaseT = Math.max(0, this.g.phaseT - dt);
    this.g.passT = Math.max(0, this.g.passT - dt);
    this.g.doubleT = Math.max(0, this.g.doubleT - dt);
    this.g.player.updateShield(dt, this.g.graceT);
    // Phase: the ship ghosts while it's armed, and most of all while it passes through.
    this.g.player.setPhase(this.g.passT > 0 ? 1 : this.g.phaseT > 0 ? 0.6 : 0, this.g.runTime, this.g.settings.reduceMotion);
    if (this.magnetT > 0) {
      this.magnetT = Math.max(0, this.magnetT - dt);
      this.g.world.attractPickups(dt);
    }
    this.slowT = Math.max(0, this.slowT - dt);
    const goal = this.slowT > 0 ? 1 : 0;
    this.g.slowLevel += (goal - this.g.slowLevel) * (1 - Math.exp(-4 * dt));
    const parts: string[] = [];
    if (this.g.shield) parts.push('shield');
    if (this.magnetT > 0) parts.push(`magnet ${Math.ceil(this.magnetT)}`);
    if (this.slowT > 0) parts.push(`slow-mo ${Math.ceil(this.slowT)}`);
    if (this.g.phaseT > 0) parts.push(`phase ${Math.ceil(this.g.phaseT)}`);
    if (this.g.doubleT > 0) parts.push(`x${CONFIG.powers.double.factor} ${Math.ceil(this.g.doubleT)}`);
    this.g.ui.setPower(parts.join('  '));
  }

  endPowers(): void {
    this.g.shield = false;
    this.g.graceT = this.magnetT = this.slowT = this.g.slowLevel = 0;
    this.g.phaseT = this.g.passT = this.g.doubleT = 0;
    this.g.player.setPhase(0, 0, true);
    this.g.player.setShield(false);
    this.g.player.updateShield(0, 0);
    this.g.ui.setPower('');
  }
}
