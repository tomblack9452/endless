// Ranked run submission. Checks a run is possible before it goes on the board:
//   - the week is this week (UTC)
//   - the score fits the distance flown (distance points plus the most the
//     bonuses could add) and the time taken (no faster than full boost)
//   - the path has one sample every 4 units of the distance, and never moves
//     sideways faster than the ship can
// A full check re-flies the run with the game's own code; that needs the run
// simulation split out of game.ts (see the README's roadmap).
//
// Deploy: supabase functions deploy submit-run

import { createClient } from 'npm:@supabase/supabase-js@2';

const PATH_STEP = 4;
const POINTS_PER_UNIT = 0.85; // CONFIG.score.pointsPerUnit
const MAX_BONUS_SHARE = 1.5; // pickups, near-miss chains and boost on top of distance (generous)
const TOP_SPEED = 115; // units/s: CONFIG.speed.max with full boost (75 x 1.45), plus a margin
const MAX_SIDEWAYS_PER_STEP = 12; // units of sideways travel per path step at the slowest speed

interface Run {
  week: string;
  league: number;
  score: number;
  seconds: number;
  distance: number;
  finished: boolean;
  path: number[];
}

function weekKey(ms: number): string {
  const d = new Date(ms);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)).toISOString().slice(0, 10);
}

function check(r: Run): string | null {
  if (r.week !== weekKey(Date.now())) return 'not this week';
  if (!Number.isFinite(r.score) || r.score < 0) return 'bad score';
  if (r.score > r.distance * POINTS_PER_UNIT * (1 + MAX_BONUS_SHARE) + 500) return 'score too high for the distance';
  if (r.distance / Math.max(0.1, r.seconds) > TOP_SPEED) return 'too fast';
  if (Math.abs(r.path.length - Math.ceil(r.distance / PATH_STEP)) > 2) return 'path does not match the distance';
  for (let i = 1; i < r.path.length; i++) if (Math.abs(r.path[i] - r.path[i - 1]) > MAX_SIDEWAYS_PER_STEP) return 'path jumps';
  return null;
}

Deno.serve(async (req) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('Authorization') ?? '';
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: user } = await admin.auth.getUser(auth.replace('Bearer ', ''));
  if (!user?.user) return new Response('sign in first', { status: 401, headers: cors });
  const run = (await req.json()) as Run;
  const problem = check(run);
  if (problem) return new Response(problem, { status: 422, headers: cors });
  const { error } = await admin.from('runs').insert({
    user_id: user.user.id,
    week: run.week,
    league: run.league,
    score: Math.floor(run.score),
    seconds: run.seconds,
    distance: run.distance,
    finished: run.finished,
    path: run.path,
  });
  if (error) return new Response(error.message, { status: 500, headers: cors });
  return new Response('{}', { headers: { ...cors, 'Content-Type': 'application/json' } });
});
