import { describe, expect, it } from 'vitest';
import { describeShip } from '../src/portrait';

// The words under a pilot's ship on the leaderboard.

describe('ship descriptions', () => {
  it('name what a pilot has on, leaving out the plain slots', () => {
    expect(describeShip({ hull: 'needle', paint: 'standard', markings: 'none', fins: 'twin', engine: 'cold', decal: 'none', trail: 'triple' })).toBe(
      'needle hull · twin fins · cold blue engine colour · triple flame',
    );
  });

  it('fall back to plain looks for ids this version does not know', () => {
    expect(describeShip({ hull: 'from-the-future', paint: 'nope' })).toBe('dart hull');
    expect(describeShip({})).toBe('dart hull');
  });
});
