import { storage } from '../storage';
import type { ShipLook } from '../portrait';
import type { Backend, BoardQuery, BoardRow, RunSubmission, SubmitResult } from './backend';

// Supabase over plain fetch (no SDK, to keep the bundle small):
//   auth      anonymous sign-in, refreshed as it expires
//   saves     one row per player: every saved key as JSON (cloud save)
//   wallets   cores, written only by the server (RPCs and the store webhook)
//   runs      every submitted run, written only by the submit_run function, which checks it
//   bests     each player's best per board; read through the leaderboard function
// The tables, policies and functions are in supabase/ (see docs/leaderboards.md).

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

  get userId(): string | null {
    return this.session?.user ?? null;
  }

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

  /** A request as the signed-in player, with the status so callers can tell "no signal" from "no". */
  private async request(path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
    if (!this.session) return { status: 0, body: null };
    if (this.session.expires - Date.now() < 60_000 && !(await this.signIn())) return { status: 0, body: null };
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
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = text;
      }
      return { status: res.status, body };
    } catch {
      return { status: 0, body: null }; // offline
    }
  }

  /** A request as the signed-in player; null on any failure (the game carries on). */
  private async call<T>(path: string, init: RequestInit = {}): Promise<T | null> {
    const { status, body } = await this.request(path, init);
    return status >= 200 && status < 300 ? (body as T) : null;
  }

  /** The server's reason for turning something down ("score too high for the distance"). */
  private static reason(body: unknown): string {
    const m = (body as { message?: unknown } | null)?.message;
    return typeof m === 'string' ? m : 'turned down';
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

  async syncCredits(credits: number, last: number | null): Promise<number | null> {
    const n = await this.call<number>('/rest/v1/rpc/sync_credits', { method: 'POST', body: JSON.stringify({ p_credits: Math.floor(credits), p_last: last }) });
    return typeof n === 'number' ? n : null;
  }

  async earnCores(amount: number, reason: string): Promise<void> {
    await this.call('/rest/v1/rpc/earn_cores', { method: 'POST', body: JSON.stringify({ amount, reason }) });
  }

  async spendCores(amount: number, reason: string): Promise<boolean> {
    const ok = await this.call<boolean>('/rest/v1/rpc/spend_cores', { method: 'POST', body: JSON.stringify({ amount, reason }) });
    return ok === true;
  }

  async submitRun(run: RunSubmission): Promise<SubmitResult> {
    const { status, body } = await this.request('/rest/v1/rpc/submit_run', {
      method: 'POST',
      body: JSON.stringify({
        p_board: run.board,
        p_league: run.league,
        p_score: Math.floor(run.score),
        p_seconds: run.seconds,
        p_distance: run.distance,
        p_finished: run.finished,
        p_path: run.path,
      }),
    });
    if (status >= 200 && status < 300) {
      const r = body as { rank?: number; best?: number; newBest?: boolean };
      return { status: 'ok', rank: r.rank, best: r.best, newBest: r.newBest };
    }
    // No signal, a busy server, or a session that needs renewing: try again later.
    // Any other answer is the server saying no, and asking again won't change it.
    // The "too quickly" rate limit is the one 4xx worth another try.
    const message = SupabaseBackend.reason(body);
    if (status === 0 || status >= 500 || status === 401 || status === 403 || status === 429 || /too many runs too quickly/.test(message)) return { status: 'retry', message };
    return { status: 'rejected', message };
  }

  async board(q: BoardQuery): Promise<BoardRow[] | null> {
    const rows = await this.call<{ rank: number; name: string; score: number; you: boolean; premium?: boolean; ship?: ShipLook | null }[]>('/rest/v1/rpc/leaderboard', {
      method: 'POST',
      body: JSON.stringify({ p_board: q.board, p_period: q.period, p_league: q.league, p_limit: q.limit ?? 50 }),
    });
    return rows ? rows.map((r) => ({ rank: Number(r.rank), name: r.name, score: r.score, you: r.you, premium: r.premium === true, ship: r.ship ?? null })) : null;
  }

  async purchases(): Promise<string[] | null> {
    const rows = await this.call<{ product: string }[]>(`/rest/v1/store_events?select=product&user_id=eq.${this.session?.user}`);
    return rows ? [...new Set(rows.map((r) => r.product))] : null;
  }

  async pilotName(): Promise<string | null> {
    const rows = await this.call<{ name: string }[]>(`/rest/v1/players?select=name&user_id=eq.${this.session?.user}`);
    return rows?.[0]?.name ?? null;
  }

  async setShip(ship: ShipLook): Promise<boolean> {
    const { status } = await this.request('/rest/v1/rpc/set_ship', { method: 'POST', body: JSON.stringify({ p_ship: ship }) });
    return status >= 200 && status < 300;
  }

  async deleteAccount(): Promise<boolean> {
    if (!this.session && !(await this.signIn())) return false;
    const { status } = await this.request('/rest/v1/rpc/delete_my_account', { method: 'POST', body: '{}' });
    if (status < 200 || status >= 300) return false;
    this.session = null;
    return true;
  }

  async setPilotName(name: string): Promise<{ ok: boolean; message: string }> {
    const { status, body } = await this.request('/rest/v1/rpc/set_pilot_name', { method: 'POST', body: JSON.stringify({ p_name: name }) });
    if (status >= 200 && status < 300) return { ok: true, message: String(body) };
    return { ok: false, message: status === 0 ? 'no connection' : SupabaseBackend.reason(body) };
  }
}
