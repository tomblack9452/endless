import { describe, expect, it } from 'vitest';
import { isOpen, nextStageText, stageFor } from '../src/reveal';

describe('staged reveal', () => {
  it('opens solo, the shop and the record after 3 runs, ranked after the tutorial and 5', () => {
    expect(stageFor(0, false)).toBe(0);
    expect(isOpen('shop', stageFor(2, true))).toBe(false);
    expect(isOpen('shop', stageFor(3, false))).toBe(true);
    expect(isOpen('ranked', stageFor(10, false))).toBe(false); // no tutorial yet
    expect(isOpen('ranked', stageFor(4, true))).toBe(false);
    expect(isOpen('ranked', stageFor(5, true))).toBe(true);
    expect(isOpen('leaderboard', stageFor(5, true))).toBe(true);
  });

  it('says what opens next', () => {
    expect(nextStageText(1, false)).toBe('solo, the shop and your service record open after 2 more runs');
    expect(nextStageText(4, true)).toBe('ranked opens after 1 more run');
    expect(nextStageText(9, false)).toBe('ranked opens after the tutorial');
    expect(nextStageText(9, true)).toBe('');
  });
});
