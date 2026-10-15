import { describe, expect, it } from 'vitest';
import { exitChoice } from '../src/platform/exit';

describe('back at the top of the game', () => {
  it('asks before closing the Android app when the setting is on', () => {
    expect(exitChoice({ native: true, ask: true, asking: false })).toBe('ask');
  });

  it('closes straight away when the setting is off', () => {
    expect(exitChoice({ native: true, ask: false, asking: false })).toBe('exit');
  });

  it('back again while the dialog shows means stay', () => {
    expect(exitChoice({ native: true, ask: true, asking: true })).toBe('stay');
    expect(exitChoice({ native: true, ask: false, asking: true })).toBe('stay');
  });

  it('never asks on the web', () => {
    expect(exitChoice({ native: false, ask: true, asking: false })).toBe('none');
    expect(exitChoice({ native: false, ask: false, asking: false })).toBe('none');
  });
});
