import type { ShipLook } from '../portrait';
import { LocalBackend } from './local';
import { SupabaseBackend } from './supabase';

// The server, behind one interface. With Supabase keys in .env the game signs
// in (anonymously at first), keeps a cloud save, holds cores on the server,
// submits runs to the leaderboards and reads them. Without keys, LocalBackend
// stands in and everything keeps working on the device.

/** A leaderboard: the week's ranked run, endless, or one solo environment. */
export type BoardId = 'ranked' | 'endless' | `solo:${string}`;

/** A finished run as submitted for a leaderboard. */
export interface RunSubmission {
  board: BoardId;
  /** The league the run was flown in (ranked only; 0 elsewhere). */
  league: number;
  score: number;
  seconds: number;
  distance: number;
  finished: boolean;
  /** Ranked: the ship's sideways position every few units (the ghost, and a check on the run). Empty elsewhere. */
  path: number[];
}

/** How a submission went: ok, worth retrying later (no signal, server busy), or turned down for good. */
export interface SubmitResult {
  status: 'ok' | 'retry' | 'rejected';
  /** Where the run ranks on its board, when it went through. */
  rank?: number;
  /** The player's best on that board after this run. */
  best?: number;
  newBest?: boolean;
  /** Why it was turned down. */
  message?: string;
}

/** Which board to read. period is the week's Monday for ranked, 'all' otherwise. */
export interface BoardQuery {
  board: BoardId;
  period: string;
  league: number;
  limit?: number;
}

export interface BoardRow {
  rank: number;
  name: string;
  score: number;
  you: boolean;
  /** Owns the premium unlock (a badge on the board). */
  premium?: boolean;
  /** The looks the pilot has on (drawn next to their name), if they've sent them. */
  ship?: ShipLook | null;
  /** The pilot's public id, for their service record (pilotRecord); not their account id. */
  pid?: string;
}

/** The summary of a service record each pilot sends for others to see: rank, xp and lifetime stats, all numbers. */
export type PilotStats = Partial<Record<'rank' | 'xp' | 'runs' | 'seconds' | 'distance' | 'bestLevel' | 'bestChain' | 'nearMisses' | 'pickups' | 'rankedRuns', number>>;

/** A pilot's service record as the boards show it. */
export interface PilotRecord {
  name: string;
  premium: boolean;
  ship: ShipLook | null;
  stats: PilotStats;
  /** The best score on each board they're on (board id to score). */
  bests: Record<string, number>;
  /** When they joined (ms). */
  since: number;
}

export type LinkResult = 'linked' | 'taken' | 'failed';

/** A purchase on the server's records: the product ('refunded:<product>' once refunded) and when it was kept (ms). */
export interface Purchase {
  product: string;
  at: number;
}

export interface Backend {
  /** True when talking to a real server. */
  readonly online: boolean;
  /** The signed-in account's id (the store buys as this account), or null. */
  readonly userId: string | null;
  /** The time to trust for rewards, streaks, days and weeks (ms): the server's clock once known, the device's until then and offline. */
  now(): number;
  /** True once now() follows the server's clock. */
  readonly clockKnown: boolean;
  /** Learn (or refresh) the server's clock; resolves true if it's known. Quick, and needs no sign-in. */
  syncClock(): Promise<boolean>;
  /** Sign in (or restore the session). Resolves false if the server can't be reached. */
  signIn(): Promise<boolean>;
  /** The cloud save: every saved key, and when it was written (ms); null if there's none, undefined if it couldn't be read. */
  loadSave(): Promise<{ data: Record<string, string>; savedAt: number } | null | undefined>;
  pushSave(data: Record<string, string>, savedAt: number): Promise<void>;
  /** The server's cores balance, or null to keep the device's. */
  cores(): Promise<number | null>;
  /** Cores earned in play (rewards, quests, the pass); the server caps them per day. */
  earnCores(amount: number, reason: string): Promise<void>;
  /** Merge the device's credits with the server's (`last`: the server's answer last time, or null); the balance to keep, or null if unknown. */
  syncCredits(credits: number, last: number | null): Promise<number | null>;
  /** Spend cores; resolves false if the server says there aren't enough. */
  spendCores(amount: number, reason: string): Promise<boolean>;
  submitRun(run: RunSubmission): Promise<SubmitResult>;
  /** A board, best first (your own row last if you're below the top), or null if it couldn't be read. */
  board(query: BoardQuery): Promise<BoardRow[] | null>;
  /** What this account has bought (the purchase webhook's records), or null if unknown. */
  purchases(): Promise<Purchase[] | null>;
  /** Your pilot name on the boards, or null. */
  pilotName(): Promise<string | null>;
  /** Change it; says why not when the server turns it down. */
  setPilotName(name: string): Promise<{ ok: boolean; message: string }>;
  /** Show these looks next to your name on the boards; false if it didn't get there. */
  setShip(ship: ShipLook): Promise<boolean>;
  /** Share your service record's summary, for others tapping you on the boards; false if it didn't get there. */
  setRecord(stats: PilotStats): Promise<boolean>;
  /** A pilot's service record by the public id a board row gave, or null if it couldn't be read. */
  pilotRecord(pid: string): Promise<PilotRecord | null>;
  /** True once if the account was marked to be maxed out from the SQL editor (players.max_out); clears the mark. */
  takeMaxOut(): Promise<boolean>;
  /** The Google account this account is kept with (its email), '' if none, or null if unknown. */
  googleAccount(): Promise<string | null>;
  /** Why the last Google link or sign-in was turned down (the server's error code), for the notice; '' if none. */
  readonly authError: string;
  /** Keep this account with a Google login (see account.ts): 'taken' when that login is already another account's. */
  linkGoogle(idToken: string, nonce: string): Promise<LinkResult>;
  /** Switch to the account a Google login keeps (this session is replaced); false if that didn't work. */
  signInGoogle(idToken: string, nonce: string): Promise<boolean>;
  /** Delete this account and everything the server holds for it; false if that couldn't be done. */
  deleteAccount(): Promise<boolean>;
}

export function createBackend(): Backend {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return url && key ? new SupabaseBackend(url, key) : new LocalBackend();
}
