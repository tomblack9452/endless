import { describe, expect, it } from 'vitest';
import { RANK_COLOURS, rankColour, RANKS } from '../src/ranks';

// The menus' colour as you climb: a change every band or two, and always readable.

const lum = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

describe('rank colours', () => {
  it('start at the first rank and change as you climb, ending in gold for generals', () => {
    expect(rankColour(0)).toBe(RANK_COLOURS[0]);
    expect(rankColour(RANKS.length - 1).name).toBe('gold');
    const seen = new Set(RANKS.map((_, i) => rankColour(i).name));
    expect(seen.size).toBe(RANK_COLOURS.length);
    for (let i = 1; i < RANKS.length; i++) expect(RANK_COLOURS.indexOf(rankColour(i))).toBeGreaterThanOrEqual(RANK_COLOURS.indexOf(rankColour(i - 1)));
  });

  it('keep the page colour readable on a filled button', () => {
    for (const c of RANK_COLOURS) expect(contrast(c.accent, '#f1ede4'), c.name).toBeGreaterThanOrEqual(4.5);
  });
});
