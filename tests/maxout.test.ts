import { describe, expect, it } from 'vitest';
import { LOOKS, Looks, type Owner } from '../src/looks';
import { Progress } from '../src/progress';

// Maxing out (players.max_out, or the dev panel's "unlock all").

const nobody: Owner = { rank: 0, stars: 0, league: 0, premium: false, goal: () => ({ have: 0, target: 1, done: false }) };

describe('maxing out', () => {
  it('owns every look of every kind, even with no rank, stars, league, goals or premium', () => {
    const looks = new Looks();
    looks.buyAll();
    const missing = LOOKS.filter((l) => !looks.owns(l, nobody)).map((l) => `${l.slot}:${l.id}`);
    expect(missing).toEqual([]);
  });

  it('opens every level and part of the game', () => {
    const p = new Progress();
    expect(p.allOpen).toBe(false);
    p.openAll();
    expect(p.allOpen).toBe(true);
  });
});
