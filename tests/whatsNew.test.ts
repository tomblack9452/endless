import { describe, expect, it } from 'vitest';
import pkg from '../package.json';
import { compareVersions, latestNotes, WHATS_NEW, whatsNewOnLaunch } from '../src/ui/whatsNew';

// The "what's new" card: the first launch after an update only.

describe("what's new", () => {
  it('has 3 to 5 short lines for each version', () => {
    for (const lines of Object.values(WHATS_NEW)) {
      expect(lines.length).toBeGreaterThanOrEqual(3);
      expect(lines.length).toBeLessThanOrEqual(5);
      for (const l of lines) {
        expect(l.length).toBeLessThanOrEqual(46); // one line each on a 360 wide phone
        expect(l).toBe(l.toLowerCase()); // the game's voice
      }
    }
  });

  it("has this version's lines", () => {
    expect(WHATS_NEW[pkg.version]).toBeDefined();
    expect(latestNotes(pkg.version)?.version).toBe(pkg.version);
  });

  it('compares versions as numbers', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1);
    expect(compareVersions('1.0.7', '1.0.7')).toBe(0);
    expect(compareVersions('1.0.6', '1.1')).toBe(-1);
  });

  it('shows after an update, from a version that never saw it too', () => {
    expect(whatsNewOnLaunch('1.0.6', '1.0.7', false)).toEqual(WHATS_NEW['1.0.7']);
    expect(whatsNewOnLaunch(null, '1.0.7', false)).toEqual(WHATS_NEW['1.0.7']); // 1.0.6 kept no version
  });

  it('never on a fresh install, never twice, and not for a build with nothing new', () => {
    expect(whatsNewOnLaunch(null, '1.0.7', true)).toBeNull();
    expect(whatsNewOnLaunch('1.0.7', '1.0.7', false)).toBeNull();
    expect(whatsNewOnLaunch('1.0.8', '1.0.7', false)).toBeNull(); // an older build after a newer one
    expect(latestNotes('1.0.12')?.version).toBe('1.0.11'); // a later build without lines of its own...
    expect(whatsNewOnLaunch('1.0.11', '1.0.12', false)).toBeNull(); // ...shows nothing to someone who saw 1.0.11's
    expect(whatsNewOnLaunch('1.0.10', '1.0.11', false)).toEqual(WHATS_NEW['1.0.11']); // 1.0.11's own lines after 1.0.10
    expect(latestNotes('1.0.6')).toBeNull();
  });
});
