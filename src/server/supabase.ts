import { storage } from '../storage';
import type { Backend, BoardRow, RunSubmission } from './backend';

// Supabase over plain fetch (no SDK, to keep the bundle small):
//   auth      anonymous sign-in, refreshed as it expires
//   saves     one row per player: every saved key as JSON (cloud save)
//   wallets   cores, written only by the server (RPCs and the store webhook)
//   runs      ranked runs, written by the submit-run function, which checks them
//   board     a view of each week's best run per player, per league
// The tables, policies and functions are in supabase/ (see the README).

const SESSION_KEY = 'endless.session';

interface Session {
  access: string;
  refresh: string;
  expires: number; // ms
  user: string;
}

export class SupabaseBackend implements Backend {
  readonly online = true;
  private session: Session | null = null;

  constructor(
    private readonly url: string,
    private readonly key: string,
  ) {}

  async signIn(): Promise<boolean> {
    try {
      const raw = await storage.get(SESSION_KEY);
      if (raw) this.session = JSON.parse(raw) as Session;
      if (this.session && this.session.expires - Date.now() > 60_000) return true;
      if (this.session) {
        const s = await this.auth('token?grant_type=refresh_token', { refresh_token: this.session.refresh });
        if (s) return true;
      }
      return (await this.auth('signup', { data: {} })) !== null;
    } catch {
      return false;
    }
  }

  private async auth(path: string, body: unknown): Promise<Session | null> {
    const res = await fetch(`${this.url}/auth/v1/${path}`, {
      method: 'POST',
      headers: { apikey: this.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number; user: { id: string } };
    this.session = { access: j.access_token, refresh: j.refresh_token, expires: Date.now() + j.expires_in * 1000, user: j.user.id };
    void storage.set(SESSION_KEY, JSON.stringify(this.session));
    return this.session;
  }

  /** A request as the signed-in player; null on any failure (the game carries on). */
  private async call<T>(path: string, init: RequestInit = {}): Promise<T | null> {
    if (!this.session) return null;
    if (this.session.expires - Date.now() < 60_000 && !(await this.signIn())) return null;
    try {
      const res = await fetch(`${this.url}${path}`, {
        ...init,
        headers: {
          apikey: this.key,
          Authorization: `Bearer ${this.session.access}`,
          'Content-Type': 'application/json',
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      if (!res.ok) return null;
      const text = await res.text();
      return (text ? JSON.parse(text) : {}) as T;
    } catch {
      return null;
    }
  }

  async loadSave(): Promise<{ data: Record<string, string>; savedAt: number } | null> {
    const rows = await this.call<{ data: Record<string, string>; saved_at: number }[]>(`/rest/v1/saves?select=data,saved_at&user_id=eq.${this.session?.user}`);
    const row = rows?.[0];
    return row ? { data: row.data, savedAt: row.saved_at } : null;
  }

  async pushSave(data: Record<string, string>, savedAt: number): Promise<void> {
    await this.call('/rest/v1/saves', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: this.session?.user, data, saved_at: savedAt }),
    });
  }

  async cores(): Promise<number | null> {
    const rows = await this.call<{ cores: number }[]>(`/rest/v1/wallets?select=cores&user_id=eq.${this.session?.user}`);
    return rows?.[0]?.cores ?? null;
  }

  async earnCores(amount: number, reason: string): Promise<void> {
    await this.call('/rest/v1/rpc/earn_cores', { method: 'POST', body: JSON.stringify({ amount, reason }) });
  }

  async spendCores(amount: number, reason: string): Promise<boolean> {
    const ok = await this.call<boolean>('/rest/v1/rpc/spend_cores', { method: 'POST', body: JSON.stringify({ amount, reason }) });
    return ok === true;
  }

  async submitRun(run: RunSubmission): Promise<void> {
    await this.call('/functions/v1/submit-run', { method: 'POST', body: JSON.stringify(run) });
  }

  async board(week: string, league: number): Promise<BoardRow[]> {
    const rows = await this.call<{ user_id: string; name: string; score: number }[]>(
      `/rest/v1/board?select=user_id,name,score&week=eq.${week}&league=eq.${league}&order=score.desc&limit=50`,
    );
    return (rows ?? []).map((r) => ({ name: r.name, score: r.score, you: r.user_id === this.session?.user }));
  }
}
