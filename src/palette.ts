import { Color } from 'three';
import { CONFIG, type Palette } from './config';

// Live palette as THREE.Color objects. Materials hold references to these
// colours via copy() each frame they change.

export class LivePalette {
  readonly ground = new Color();
  readonly sky = new Color();
  readonly fog = new Color();
  readonly cubeLight = new Color();
  readonly cubeMid = new Color();
  readonly cubeDark = new Color();
  readonly ship = new Color();
  readonly shipShade = new Color();
  readonly text = new Color();
  // Theme colours (not per-level palette entries).
  readonly rock = new Color(CONFIG.themes.canyon.rock);
  readonly strip = new Color(CONFIG.themes.interior.strip);
  readonly obstacle = new Color(CONFIG.themes.canyon.obstacle);
  readonly pickup = new Color(CONFIG.boost.pickup.color);
  // Brightness for props whose hues are baked in (trees, crystals): white by day.
  readonly light = new Color(1, 1, 1);
  // Multiplied onto the structure's materials: white normally, red in a red alert.
  readonly alert = new Color(1, 1, 1);

  set(p: Palette): void {
    this.ground.set(p.ground);
    this.sky.set(p.sky);
    this.fog.set(p.fog);
    this.cubeLight.set(p.cubeLight);
    this.cubeMid.set(p.cubeMid);
    this.cubeDark.set(p.cubeDark);
    this.ship.set(p.ship);
    this.shipShade.set(p.shipShade);
    this.text.set(p.text);
  }

  copy(o: LivePalette): void {
    this.ground.copy(o.ground);
    this.sky.copy(o.sky);
    this.fog.copy(o.fog);
    this.cubeLight.copy(o.cubeLight);
    this.cubeMid.copy(o.cubeMid);
    this.cubeDark.copy(o.cubeDark);
    this.ship.copy(o.ship);
    this.shipShade.copy(o.shipShade);
    this.text.copy(o.text);
    this.rock.copy(o.rock);
    this.strip.copy(o.strip);
    this.obstacle.copy(o.obstacle);
    this.pickup.copy(o.pickup);
    this.light.copy(o.light);
    this.alert.copy(o.alert);
  }

  textCss(): string {
    return '#' + this.text.getHexString();
  }
}
