import { Color } from 'three';
import { CONFIG } from './config';
import type { LivePalette } from './palette';

// Biomes: the outdoor themes change look each loop of the three themes.
//   loop 1: alien open ground -> canyon      -> interior
//   loop 2: ice field         -> asteroid belt -> interior
//   loop 3: volcanic plain    -> canyon      -> interior   (then repeats)
// The generators are the open-ground and canyon ones; a biome changes which
// props they use and recolours the scene. The asteroid belt also drops the
// ground away and opens the sky to space.

export type Biome = 'alien' | 'ice' | 'volcanic' | 'canyon' | 'asteroids' | 'interior';

export const BIOME_NAMES: Record<Biome, string> = {
  alien: 'open ground',
  ice: 'ice field',
  volcanic: 'volcanic plain',
  canyon: 'canyon',
  asteroids: 'asteroid belt',
  interior: 'interior',
};

interface Look {
  ground: string;
  sky: string;
  fog: string;
  rock: string;
  obstacle: string;
  light: [number, number, number]; // multiplies baked prop colours
  amount: number; // how far towards these colours (time of day still shows through)
  ship?: [string, string]; // ship top and shade, where the default would vanish into the ground
}

const B = CONFIG.biomes;
const LOOKS: Partial<Record<Biome, Look>> = B.looks;

const tmp = new Color();

/** Recolour the live palette towards the biome by `k` (0..1, theme fade). */
export function tintBiome(p: LivePalette, biome: Biome, k: number): void {
  const look = LOOKS[biome];
  if (!look || k <= 0.001) return;
  const a = look.amount * k;
  p.ground.lerp(tmp.set(look.ground), a);
  p.sky.lerp(tmp.set(look.sky), a);
  p.fog.lerp(tmp.set(look.fog), a);
  p.rock.lerp(tmp.set(look.rock), k);
  p.obstacle.lerp(tmp.set(look.obstacle), k);
  const [r, g, b] = look.light;
  if (look.ship) {
    p.ship.lerp(tmp.set(look.ship[0]), k);
    p.shipShade.lerp(tmp.set(look.ship[1]), k);
  }
  p.light.multiply(tmp.setRGB(1 + (r - 1) * k, 1 + (g - 1) * k, 1 + (b - 1) * k));
}
