// Wing decals that aren't a rank or league emblem: simple pictures drawn in
// currentColor (the ship draws them in white and tints them, see player.ts).
// Each is a 24 x 24 SVG, bold enough to read at about 0.17 units across.

import { seasonDecal } from './seasonLooks';

const svg = (body: string): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`;
const fill = (d: string, rule = 'nonzero'): string => `<path fill="currentColor" fill-rule="${rule}" d="${d}"/>`;
const line = (d: string, w = 2.2): string => `<path fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`;

export const DECAL_SVG: Record<string, string> = {
  flame: svg(fill('M12 1.5c.9 4.2 5.6 6.3 5.6 12a5.6 5.6 0 0 1-11.2 0c0-2.3 1-3.9 2.2-5 .3 2 1 2.9 2 3.2C10 8.3 11.1 4.9 12 1.5z')),
  wing: svg(fill('M2 15c4 .3 7-1 9-5l1 3 1-3c2 4 5 5.3 9 5-2 4-6 6-10 6S4 19 2 15zM12 4l1.6 4.2h-3.2z')),
  rocket: svg(fill('M12 1.5c3.2 2.4 4.6 6 4.2 10.5l2.3 3.3v4.2l-3.4-1.6h-6.2l-3.4 1.6v-4.2l2.3-3.3C7.4 7.5 8.8 3.9 12 1.5zm0 6.6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z', 'evenodd')),
  star: svg(fill('M12 1.8l3 6.4 7 .9-5.2 4.8 1.4 6.9L12 17.4l-6.2 3.4 1.4-6.9L2 9.1l7-.9z')),
  moon: svg(fill('M20.5 14.6A9.2 9.2 0 1 1 9.4 3.5a7.4 7.4 0 0 0 11.1 11.1z')),
  target: svg(line('M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6zM12 7.4a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2z', 1.9) + fill('M12 10.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z')),
  crown: svg(fill('M2.5 18.5L1.8 7.2l5.2 4.3L12 3.5l5 8 5.2-4.3-.7 11.3zM3.5 20.2h17v2h-17z')),
  skull: svg(fill('M12 2.2a8.3 8.3 0 0 0-8.3 8.3c0 2.7 1.2 4.6 3.1 5.7v3.6h2.4v-1.7h1.5v1.7h2.6v-1.7h1.5v1.7h2.4v-3.6c1.9-1.1 3.1-3 3.1-5.7A8.3 8.3 0 0 0 12 2.2zM8.5 10.6a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM12 14.6l1.2 2.2h-2.4z', 'evenodd')),
  bolt: svg(fill('M13.6 1.6L4.6 13.4h6l-1.4 9 9.6-12.6h-6.2z')),
  laurel: svg(line('M12 21V9') + line('M12 18c-4.2 0-7-3-7-7 3.4.4 6.6 2.4 7 7zM12 14c-3.2-.2-5.5-2.6-5.5-5.8 2.8.5 5.2 2.2 5.5 5.8zM12 18c4.2 0 7-3 7-7-3.4.4-6.6 2.4-7 7zM12 14c3.2-.2 5.5-2.6 5.5-5.8-2.8.5-5.2 2.2-5.5 5.8z', 1.8)),
  atom: svg(line('M12 4.5c4.7 0 8.5 3.4 8.5 7.5s-3.8 7.5-8.5 7.5S3.5 16.1 3.5 12 7.3 4.5 12 4.5zM4.6 7.6c2.3-3.7 8-3.7 13.9-.3 5.8 3.4 7.5 8.6 5.4 11.7' ) + fill('M12 10.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z')),
  planet: svg(fill('M12 6.4a5.6 5.6 0 1 0 0 11.2 5.6 5.6 0 0 0 0-11.2z') + line('M2.2 15.6c-.7-1.9 3.6-5 9.8-6.9 6.2-1.9 11.2-1.4 11.9.5', 1.7)),
  phoenix: svg(fill('M12 2.4c1.1 2.6 3.2 3.4 3.2 6 0 1.3-.5 2.2-1.2 2.9l5.4-3.6c0 4.2-2.2 7.4-6.1 9.2l1.5 4.7L12 19.2l-2.8 2.4 1.5-4.7C6.8 15.1 4.6 11.9 4.6 7.7l5.4 3.6c-.7-.7-1.2-1.6-1.2-2.9 0-2.6 2.1-3.4 3.2-6z')),
};

/** A wing decal's art by id: a hand-made picture or a season's generated one (null for rank, league or none). */
export function decalArt(id: string): string | null {
  return DECAL_SVG[id] ?? seasonDecal(id);
}
