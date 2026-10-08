import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeShip, Portraits } from '../src/portrait';
import type { LivePalette } from '../src/palette';

// The words under a pilot's ship on the leaderboard, and the renderer that draws its picture.

const made = vi.hoisted(() => ({ renderers: [] as { disposed: boolean; lost: boolean }[], ships: [] as { disposed: boolean }[] }));

vi.mock('three', async (original) => {
  const three = await original<typeof import('three')>();
  class FakeRenderer {
    disposed = false;
    lost = false;
    readonly domElement = { toDataURL: () => `data:image/png;base64,${made.renderers.length}` };
    constructor() {
      made.renderers.push(this);
    }
    setPixelRatio(): void {}
    setSize(): void {}
    setClearColor(): void {}
    render(): void {}
    dispose(): void {
      this.disposed = true;
    }
    forceContextLoss(): void {
      this.lost = true;
    }
  }
  return { ...three, WebGLRenderer: FakeRenderer };
});

vi.mock('../src/player', async () => {
  const { Group } = await import('three');
  class Player {
    disposed = false;
    readonly engine = new Group();
    engineHalfSpan = 0.3;
    constructor() {
      made.ships.push(this);
    }
    setVisible(): void {}
    setShape(): void {}
    setPaint(): void {}
    setDressing(): void {}
    dispose(): void {
      this.disposed = true;
    }
  }
  return { Player };
});

vi.mock('../src/trail', () => ({
  Trail: class {
    setVisible(): void {}
    setTint(): void {}
    setStyle(): void {}
    update(): void {}
    dispose(): void {}
  },
}));

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

describe('ship pictures', () => {
  beforeEach(() => {
    made.renderers.length = 0;
    made.ships.length = 0;
    vi.useFakeTimers();
    vi.stubGlobal('document', { createElement: () => ({}) });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const portraits = () => new Portraits({} as LivePalette);

  it('let the renderer go when asked, keep the pictures, and make it again for a new one', () => {
    const p = portraits();
    const first = p.get({ hull: 'needle' });
    expect(first).toMatch(/^data:image\/png/);
    expect(p.holding).toBe(true);
    p.release();
    expect(p.holding).toBe(false);
    expect(made.renderers[0]).toMatchObject({ disposed: true, lost: true });
    expect(made.ships[0].disposed).toBe(true);
    expect(p.get({ hull: 'needle' })).toBe(first); // cached: no renderer needed
    expect(p.holding).toBe(false);
    expect(p.get({ hull: 'dart' })).not.toBeNull();
    expect(made.renderers).toHaveLength(2);
    expect(p.holding).toBe(true);
  });

  it('let the renderer go after a while without drawing', () => {
    const p = portraits();
    p.get({ hull: 'needle' });
    vi.advanceTimersByTime(20_000);
    p.get({ hull: 'dart' }); // drawing again puts it off
    vi.advanceTimersByTime(20_000);
    expect(p.holding).toBe(true);
    vi.advanceTimersByTime(15_000);
    expect(p.holding).toBe(false);
    expect(made.renderers[0].lost).toBe(true);
  });
});
