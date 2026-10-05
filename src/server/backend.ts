import { LocalBackend } from './local';
import { SupabaseBackend } from './supabase';

// The server, behind one interface. With Supabase keys in .env the game signs
// in (anonymously at first), keeps a cloud save, holds cores on the server,
// submits ranked runs and reads the weekly leaderboards. Without keys,
// LocalBackend stands in and everything keeps working on the device.

/** A ranked run as submitted for the weekly leaderboard. */
export interface RunSubmission {
  week: string; // weekKey
  league: number;
  score: number;
  seconds: number;
  distance: number;
  finished: boolean;
  /** The ship's sideways position every few units (the ghost, and a check on the run). */
  path: number[];
}

export interface BoardRow {
  name: string;
  score: number;
  you: boolean;
}

export interface Backend {
  /** True when talking to a real server. */
  readonly online: boolean;
  /** Sign in (or restore the session). Resolves false if the server can't be reached. */
  signIn(): Promise<boolean>;
  /** The cloud save: every saved key, and when it was written (ms), or null if none. */
  loadSave(): Promise<{ data: Record<string, string>; savedAt: number } | null>;
  pushSave(data: Record<string, string>, savedAt: number): Promise<void>;
  /** The server's cores balance, or null to keep the device's. */
  cores(): Promise<number | null>;
  /** Cores earned in play (rewards, quests, the pass); the server caps them per day. */
  earnCores(amount: number, reason: string): Promise<void>;
  /** Spend cores; resolves false if the server says there aren't enough. */
  spendCores(amount: number, reason: string): Promise<boolean>;
  submitRun(run: RunSubmission): Promise<void>;
  /** The week's leaderboard in a league, best first. */
  board(week: string, league: number): Promise<BoardRow[]>;
}

export function createBackend(): Backend {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return url && key ? new SupabaseBackend(url, key) : new LocalBackend();
}
