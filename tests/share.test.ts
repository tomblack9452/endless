import { beforeEach, describe, expect, it, vi } from 'vitest';

// Sharing in the Android app (1.0.9): the card is written to the cache
// directory, then handed to the share sheet with a line and the Play listing.

const written: { path: string; data: string; directory: string }[] = [];
const shared: Record<string, unknown>[] = [];
let shareFails: Error | null = null;

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: {
    writeFile: async (o: { path: string; data: string; directory: string }) => {
      written.push(o);
      return { uri: `file:///cache/${o.path}` };
    },
  },
}));
vi.mock('@capacitor/share', () => ({
  Share: {
    share: async (o: Record<string, unknown>) => {
      if (shareFails) throw shareFails;
      shared.push(o);
      return {};
    },
  },
}));

const { CACHE_FILE, PLAY_LINK, shareAvailable, shareNative, shareText } = await import('../src/platform/share');

describe('sharing from the app', () => {
  beforeEach(() => {
    written.length = 0;
    shared.length = 0;
    shareFails = null;
  });

  it('writes the picture to the cache directory and shares it with the Play listing', async () => {
    const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
    const out = await shareNative(png, { score: '12,400', mode: 'endless' });
    expect(out).toBe('shared');
    expect(written).toHaveLength(1);
    expect(written[0].path).toBe(CACHE_FILE);
    expect(written[0].directory).toBe('CACHE');
    expect(atob(written[0].data).charCodeAt(1)).toBe(80); // the PNG's own bytes, as base64
    expect(shared[0].files).toEqual([`file:///cache/${CACHE_FILE}`]);
    expect(shared[0].url).toBe('https://play.google.com/store/apps/details?id=com.tomblack.endlessspace');
    expect(shared[0].url).toBe(PLAY_LINK);
    expect(shared[0].text).toBe(shareText({ score: '12,400', mode: 'endless' }));
  });

  it('says cancelled when the share sheet is closed, and unavailable when it fails', async () => {
    const png = new Blob([new Uint8Array([1, 2, 3])]);
    shareFails = new Error('Share canceled');
    expect(await shareNative(png, { score: '1', mode: 'endless' })).toBe('cancelled');
    shareFails = new Error('no activity');
    expect(await shareNative(png, { score: '1', mode: 'endless' })).toBe('unavailable');
  });

  it('shows the share button in the app again', () => {
    expect(shareAvailable()).toBe(true);
  });
});
