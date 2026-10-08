import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Backend } from '../src/server/backend';
import { SupabaseBackend, SESSION_KEY } from '../src/server/supabase';
import { CloudSave } from '../src/server/sync';
import { storage } from '../src/storage';

// Keeping the player's account and save safe when the signal or the server
// misbehaves (src/server/supabase.ts signIn, src/server/sync.ts).

const expired = { access: 'old', refresh: 'r1', expires: Date.now() - 1000, user: 'me' };
const fresh = { access_token: 't2', refresh_token: 'r2', expires_in: 3600, user: { id: 'me' } };

beforeEach(() => {
  // A stand-in for the browser's storage.
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A stand-in auth server answering a refresh with `status`; counts the calls by path. */
function auth(status: number) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = url.replace('https://x.supabase.co', '');
      calls.push(path);
      await new Promise((r) => setTimeout(r, 5));
      if (path === '/auth/v1/signup') return new Response(JSON.stringify({ ...fresh, user: { id: 'someone-new' } }), { status: 200 });
      if (path.startsWith('/auth/v1/token?grant_type=refresh_token')) return status === 200 ? new Response(JSON.stringify(fresh), { status }) : new Response(JSON.stringify({ error_code: 'x' }), { status });
      return new Response('{}', { status: 404 });
    }),
  );
  return calls;
}

describe('signing in again', () => {
  it('keeps the player when the server is busy, rather than starting a new account', async () => {
    await storage.set(SESSION_KEY, JSON.stringify(expired));
    const calls = auth(503);
    const b = new SupabaseBackend('https://x.supabase.co', 'k');
    expect(await b.signIn()).toBe(false);
    expect(calls).not.toContain('/auth/v1/signup');
    expect(JSON.parse((await storage.get(SESSION_KEY))!).user).toBe('me');
  });

  it('starts a new account only when the refresh is turned down for good', async () => {
    await storage.set(SESSION_KEY, JSON.stringify(expired));
    const calls = auth(400);
    const b = new SupabaseBackend('https://x.supabase.co', 'k');
    expect(await b.signIn()).toBe(true);
    expect(calls).toContain('/auth/v1/signup');
    expect(b.userId).toBe('someone-new');
  });

  it('refreshes once when several requests find the session expiring together', async () => {
    await storage.set(SESSION_KEY, JSON.stringify(expired));
    const calls = auth(200);
    const b = new SupabaseBackend('https://x.supabase.co', 'k');
    const all = await Promise.all([b.signIn(), b.signIn(), b.signIn()]);
    expect(all).toEqual([true, true, true]);
    expect(calls.filter((c) => c.includes('refresh_token'))).toHaveLength(1);
    expect(b.userId).toBe('me');
  });
});

describe('the cloud save', () => {
  /** A backend whose cloud save is `remote` (undefined: it can't be read); records pushes. */
  function backend(remote: { data: Record<string, string>; savedAt: number } | null | undefined) {
    const pushed: number[] = [];
    const b = { online: true, loadSave: async () => remote, pushSave: async (_d: unknown, at: number) => void pushed.push(at) } as unknown as Backend;
    return { b, pushed };
  }

  it("pushes nothing before it has compared with the cloud (a stale phone can't overwrite a newer save)", async () => {
    vi.stubGlobal('window', globalThis);
    vi.useFakeTimers();
    const { b, pushed } = backend({ data: { 'endless.wallet': '{"earned":900}' }, savedAt: Date.now() - 1000 });
    const cloud = new CloudSave(b);
    cloud.push(); // the title screen, before start() has answered
    await vi.advanceTimersByTimeAsync(10_000);
    expect(pushed).toHaveLength(0);
    expect(await cloud.start()).toBe(true); // a fresh install: the cloud's save wins
  });

  it("doesn't push over a save it couldn't read", async () => {
    vi.stubGlobal('window', globalThis);
    vi.useFakeTimers();
    await storage.set('endless.wallet', '{"earned":5}');
    const { b, pushed } = backend(undefined);
    const cloud = new CloudSave(b);
    expect(await cloud.start()).toBe(false);
    cloud.push();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(pushed).toHaveLength(0);
  });

  it('pushes once it has compared and kept the phone’s save', async () => {
    vi.stubGlobal('window', globalThis);
    vi.useFakeTimers();
    const { b, pushed } = backend(null);
    const cloud = new CloudSave(b);
    expect(await cloud.start()).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(pushed).toHaveLength(1);
  });
});
