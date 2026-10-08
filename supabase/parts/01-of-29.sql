-- Endless Space database: part 1 of 29. Run the parts in order, 01 first.

-- Endless Space: players, cloud saves, cores, ranked runs and the weekly board.
-- Run with `supabase db push` (or paste into the SQL editor). Turn on
-- anonymous sign-ins under Authentication > Providers.

-- A short public name for the leaderboard ("pilot-3fa2" until there are names).
create table if not exists public.players (
  user_id uuid primary key references auth.users on delete cascade,
  name text not null default ('pilot-' || substr(md5(random()::text), 1, 4)),
  created_at timestamptz not null default now()
);

-- Cloud save: every saved key as JSON, and when the device wrote it (ms).
create table if not exists public.saves (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  saved_at bigint not null
);

-- Cores live here. Players can read their balance; only the functions below
-- (and the store webhook, with the service key) change it.
create table if not exists public.wallets (
  user_id uuid primary key references auth.users on delete cascade,
  cores integer not null default 0 check (cores >= 0),
  earned_today integer not null default 0,
  earned_day date not null default current_date
);

create table if not exists public.core_log (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  delta integer not null,
  reason text not null,
  at timestamptz not null default now()
);

-- Ranked runs, written by the submit-run function after its checks.
create table if not exists public.runs (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  week date not null,
  league smallint not null,
  score integer not null,
  seconds real not null,
  distance real not null,
  finished boolean not null,
  path real[] not null,
  at timestamptz not null default now()
);

create index if not exists runs_board on public.runs (week, league, score desc);

-- Each player's best run per week and league.
create or replace view public.board with (security_invoker = false) as
  select distinct on (r.week, r.league, r.user_id)
    r.week, r.league, r.user_id, coalesce(p.name, 'pilot') as name, r.score
  from public.runs r
  left join public.players p on p.user_id = r.user_id
  order by r.week, r.league, r.user_id, r.score desc;

alter table public.players enable row level security;

alter table public.saves enable row level security;

alter table public.wallets enable row level security;

alter table public.core_log enable row level security;

alter table public.runs enable row level security;

drop policy if exists "own player" on public.players;

create policy "own player" on public.players for select using (auth.uid() = user_id);

drop policy if exists "own save read" on public.saves;

create policy "own save read" on public.saves for select using (auth.uid() = user_id);

drop policy if exists "own save write" on public.saves;

create policy "own save write" on public.saves for insert with check (auth.uid() = user_id);

drop policy if exists "own save update" on public.saves;

create policy "own save update" on public.saves for update using (auth.uid() = user_id);

drop policy if exists "own wallet" on public.wallets;

create policy "own wallet" on public.wallets for select using (auth.uid() = user_id);

grant select on public.board to anon, authenticated;
