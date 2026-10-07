import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeNonce } from '../src/account';
import { SupabaseBackend } from '../src/server/supabase';
import { storage } from '../src/storage';

// Keeping an account with Google (src/account.ts): the nonce, and the auth
// calls the Supabase backend makes, against a stand-in auth server.

const session = (user: string) => ({ access_token: `tok-${user}`, refresh_token: 'r', expires_in: 3600, user: { id: user } });

/** A stand-in auth server: anonymous sign-up as `anon`; the Google login keeps `owner` (null: nobody yet). */
function server(owner: string | null) {
  const calls: { path: string; body: Record<string, unknown>; auth: string | null }[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const path = url.replace('https://x.supabase.co', '');
    const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
    const auth = (init.headers as Record<string, string>).Authorization ?? null;
    calls.push({ path, body, auth });
    const json = (status: number, j: unknown) => new Response(JSON.stringify(j), { status });
    if (path === '/auth/v1/signup') return json(200, session('anon'));
    if (path === '/auth/v1/token?grant_type=id_token') {
      if (body.link_identity) {
        if (owner && owner !== 'anon') return json(422, { code: 422, error_code: 'identity_already_exists', msg: 'Identity is already linked to another user' });
        owner = 'anon';
        return json(200, session('anon'));
      }
      return owner ? json(200, session(owner)) : json(400, { error_code: 'validation_failed' });
    }
    if (path === '/auth/v1/user') {
      const identities = owner === 'anon' ? [{ provider: 'google', identity_data: { email: 'tom@example.com' } }] : [];
      return json(200, { id: 'anon', identities });
    }
    return json(404, {});
  });
  vi.stubGlobal('fetch', fetch);
  return calls;
}

describe('keeping an account with google', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('the nonce sent to Google is the SHA-256 of the one sent to the server', async () => {
    const n = await makeNonce();
    expect(n.raw).toMatch(/^[0-9a-f]{32}$/);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(n.raw)));
    expect(n.hashed).toBe(Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join(''));
    expect(n.hashed).toMatch(/^[0-9a-f]{64}$/);
    expect((await makeNonce()).raw).not.toBe(n.raw);
  });

  it('links a new Google login to the anonymous account, as that account', async () => {
    vi.spyOn(storage, 'get').mockResolvedValue(null);
    vi.spyOn(storage, 'set').mockResolvedValue();
    const calls = server(null);
    const b = new SupabaseBackend('https://x.supabase.co', 'key');
    expect(await b.signIn()).toBe(true);
    expect(await b.googleAccount()).toBe('');
    expect(await b.linkGoogle('id-token', 'raw-nonce')).toBe('linked');
    const link = calls.find((c) => c.body.link_identity)!;
    expect(link.body).toMatchObject({ provider: 'google', id_token: 'id-token', nonce: 'raw-nonce' });
    expect(link.auth).toBe('Bearer tok-anon'); // linked to this account, not a new one
    expect(b.userId).toBe('anon');
    expect(await b.googleAccount()).toBe('tom@example.com');
  });

  it("says when the Google login already keeps another account, and switches to it", async () => {
    vi.spyOn(storage, 'get').mockResolvedValue(null);
    const set = vi.spyOn(storage, 'set').mockResolvedValue();
    server('old-phone');
    const b = new SupabaseBackend('https://x.supabase.co', 'key');
    await b.signIn();
    expect(await b.linkGoogle('id-token', 'raw-nonce')).toBe('taken');
    expect(b.userId).toBe('anon');
    expect(await b.signInGoogle('id-token', 'raw-nonce')).toBe(true);
    expect(b.userId).toBe('old-phone');
    // The new session is saved before the game reloads into it.
    expect(set).toHaveBeenLastCalledWith('endless.session', expect.stringContaining('old-phone'));
  });

  it('a failed sign-in keeps the account it had', async () => {
    vi.spyOn(storage, 'get').mockResolvedValue(null);
    vi.spyOn(storage, 'set').mockResolvedValue();
    server(null);
    const b = new SupabaseBackend('https://x.supabase.co', 'key');
    await b.signIn();
    expect(await b.signInGoogle('bad', 'n')).toBe(false);
    expect(b.userId).toBe('anon');
  });
});
