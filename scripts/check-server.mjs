// `npm run check-server`: checks the Supabase setup end to end and says what's
// missing. Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from the
// environment or from .env. Signs in anonymously once (that makes one throwaway
// account); changes nothing else.
import { existsSync, readFileSync } from 'node:fs';

const env = { ...process.env };
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && !(m[1] in env && env[m[1]])) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const url = (env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
const key = env.VITE_SUPABASE_ANON_KEY ?? '';

let failed = false;
const ok = (t) => console.log(`  ok    ${t}`);
const bad = (t, fix) => {
  failed = true;
  console.log(`  FAIL  ${t}\n        -> ${fix}`);
};

console.log('Checking the Supabase setup\n');
if (!url || !key) {
  bad('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set', 'copy .env.example to .env and fill them in (Supabase: Project settings > API)');
  process.exit(1);
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) console.log(`  warn  ${url} doesn't look like https://<project>.supabase.co`);
ok(`keys found for ${url}`);

async function call(path, init) {
  try {
    const res = await fetch(url + path, init);
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, body: String(e) };
  }
}

const signup = await call('/auth/v1/signup', { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: '{"data":{}}' });
let token = '';
if (signup.status === 0) bad(`can't reach ${url}`, 'check the project URL and your connection');
else if (signup.status === 200 && signup.body?.access_token) {
  token = signup.body.access_token;
  ok('anonymous sign-in works');
} else if (signup.status === 401 || signup.status === 403) bad('the server turned the key down', 'use the anon / public key, not the service_role key (Project settings > API)');
else if (/anonymous/i.test(JSON.stringify(signup.body))) bad('anonymous sign-ins are off', 'Authentication > Sign In / Providers > turn on "Allow anonymous sign-ins"');
else bad(`sign-in failed (${signup.status}): ${JSON.stringify(signup.body)}`, 'check the key, and that anonymous sign-ins are on');

if (token) {
  const headers = { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const board = await call('/rest/v1/rpc/leaderboard', { method: 'POST', headers, body: JSON.stringify({ p_board: 'endless', p_period: 'all', p_league: 0, p_limit: 1 }) });
  if (board.status === 200) ok('the database is set up (leaderboard answers)');
  else if (board.status === 404) bad('the database has no leaderboard function yet', 'SQL editor > paste supabase/setup.sql > Run');
  else bad(`leaderboard failed (${board.status}): ${JSON.stringify(board.body)}`, 'run supabase/setup.sql in the SQL editor');

  const name = await call(`/rest/v1/players?select=name&user_id=eq.${signup.body.user.id}`, { headers });
  if (name.status === 200 && name.body?.[0]?.name) ok(`new accounts get a pilot name (${name.body[0].name})`);
  else if (board.status === 200) bad('the new account has no pilot name', 'run all of supabase/setup.sql, in order (the new-account trigger is in 0001)');

  const rejected = await call('/rest/v1/rpc/submit_run', {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_board: 'nonsense', p_league: 0, p_score: 1, p_seconds: 10, p_distance: 100, p_finished: false, p_path: [] }),
  });
  if (rejected.status === 400 && /unknown board/.test(JSON.stringify(rejected.body))) ok('submit_run checks runs');
  else if (board.status === 200) bad(`submit_run isn't answering as expected (${rejected.status})`, 'run supabase/setup.sql again');
}

console.log(failed ? '\nNot ready yet: fix the lines marked FAIL and run this again.' : '\nAll good. Run the game and the leaderboards are live.');
process.exit(failed ? 1 : 0);
