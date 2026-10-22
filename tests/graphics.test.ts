import { describe, expect, it } from 'vitest';
import { AutoGraphics } from '../src/core/autoGraphics';
import { CONFIG } from '../src/core/config';
import { cycle, DEFAULT_SETTINGS, label, migrateSettings } from '../src/core/settings';

// Graphics: auto, high or low. Performance mode (1.0.9 and older) carries over.

describe('graphics setting', () => {
  it('defaults to auto and cycles auto, high, low', () => {
    const s = { ...DEFAULT_SETTINGS };
    expect(label(s, 'graphics')).toBe('auto');
    cycle(s, 'graphics');
    expect(label(s, 'graphics')).toBe('high');
    cycle(s, 'graphics');
    expect(label(s, 'graphics')).toBe('low');
    cycle(s, 'graphics');
    expect(label(s, 'graphics')).toBe('auto');
  });

  it('carries performance mode over: on is low, off is auto', () => {
    expect(migrateSettings({ performance: true }).graphics).toBe(2);
    expect(migrateSettings({ performance: false }).graphics).toBe(0);
    expect(migrateSettings({ performance: true, graphics: 1 }).graphics).toBe(1);
    expect(migrateSettings({ graphics: 7 }).graphics).toBe(0);
    expect('performance' in migrateSettings({ performance: true })).toBe(false);
  });
});

describe('graphics on auto', () => {
  const A = CONFIG.render.auto;
  const run = (auto: AutoGraphics, ms: number, forMs: number) => {
    let fired = 0;
    for (let t = 0; t < forMs; t += ms) if (auto.feed(ms)) fired++;
    return fired;
  };

  it('stays on high while frames are comfortable', () => {
    const auto = new AutoGraphics();
    expect(run(auto, 16.7, 60_000)).toBe(0);
    expect(run(auto, A.slowFrameMs - 2, 60_000)).toBe(0);
    expect(auto.dropped).toBe(false);
  });

  it('drops to low after a few seconds of slow frames, once', () => {
    const auto = new AutoGraphics();
    expect(run(auto, 40, A.slowForMs / 2)).toBe(0);
    expect(run(auto, 40, A.slowForMs * 3)).toBe(1);
    expect(auto.dropped).toBe(true);
    expect(run(auto, 40, 60_000)).toBe(0);
  });

  it('ignores stalls and short hitches', () => {
    const auto = new AutoGraphics();
    expect(run(auto, A.stallMs + 50, 60_000)).toBe(0);
    for (let i = 0; i < 200; i++) {
      run(auto, 40, 500);
      run(auto, 12, 3000);
    }
    expect(auto.dropped).toBe(false);
  });

  it('starts counting again after a run', () => {
    const auto = new AutoGraphics();
    run(auto, 40, A.slowForMs * 0.9);
    auto.reset();
    expect(run(auto, 40, A.slowForMs * 0.9)).toBe(0);
    expect(auto.dropped).toBe(false);
  });
});
