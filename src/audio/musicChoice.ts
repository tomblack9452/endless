import { biomeForLevel, themeForLevel } from '../world/world';
import type { MusicId } from './music';

/** Music for an area of a set level. */
export function musicForArea(theme: 'land' | 'canyon' | 'interior', biome?: string): MusicId {
  if (biome === 'ice' || biome === 'volcanic' || biome === 'asteroids') return biome;
  return theme;
}

/** Music for a level: the theme's, or the biome's own where it has one. */
export function musicFor(level: number): MusicId {
  const biome = biomeForLevel(level);
  return biome === 'ice' || biome === 'volcanic' || biome === 'asteroids' ? biome : themeForLevel(level);
}
