-- Endless Space: players, cloud saves, cores, ranked runs and the weekly board.
-- Run with `supabase db push` (or paste into the SQL editor). Turn on
-- anonymous sign-ins under Authentication > Providers.

-- A short public name for the leaderboard ("pilot-3fa2" until there are names).
create table public.players (
  user_id uuid primary key references auth.users on delete cascade,
  name text not null default ('pilot-' || substr(md5(random()::text), 1, 4)),
  created_at timestamptz not null default now()
);

-- Cloud save: every saved key as JSON, and when the device wrote it (ms).
create table public.saves (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  saved_at bigint not null
);

-- Cores live here. Players can read their balance; only the functions below
-- (and the store webhook, with the service key) change it.
create table public.wallets (
  user_id uuid primary key references auth.users on delete cascade,
  cores integer not null default 0 check (cores >= 0),
  earned_today integer not null default 0,
  earned_day date not null default current_date
);

create table public.core_log (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  delta integer not null,
  reason text not null,
  at timestamptz not null default now()
);

-- Ranked runs, written by the submit-run function after its checks.
create table public.runs (
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
create index runs_board on public.runs (week, league, score desc);

-- Each player's best run per week and league.
create view public.board with (security_invoker = false) as
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

create policy "own player" on public.players for select using (auth.uid() = user_id);
create policy "own save read" on public.saves for select using (auth.uid() = user_id);
create policy "own save write" on public.saves for insert with check (auth.uid() = user_id);
create policy "own save update" on public.saves for update using (auth.uid() = user_id);
create policy "own wallet" on public.wallets for select using (auth.uid() = user_id);
grant select on public.board to anon, authenticated;

-- New accounts get a player row and an empty wallet.
create function public.on_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.players (user_id) values (new.id) on conflict do nothing;
  insert into public.wallets (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.on_new_user();

-- Cores earned in play (login calendar, quests, the pass): capped per day, so
-- an edited client can't print them.
create function public.earn_cores(amount integer, reason text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  cap constant integer := 120;
  w public.wallets;
  give integer;
begin
  select * into w from public.wallets where user_id = auth.uid() for update;
  if not found then return 0; end if;
  if w.earned_day <> current_date then
    w.earned_today := 0;
  end if;
  give := greatest(0, least(amount, cap - w.earned_today));
  update public.wallets
    set cores = cores + give, earned_today = w.earned_today + give, earned_day = current_date
    where user_id = auth.uid();
  if give > 0 then
    insert into public.core_log (user_id, delta, reason) values (auth.uid(), give, reason);
  end if;
  return give;
end $$;

create function public.spend_cores(amount integer, reason text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if amount <= 0 then return false; end if;
  update public.wallets set cores = cores - amount where user_id = auth.uid() and cores >= amount;
  if not found then return false; end if;
  insert into public.core_log (user_id, delta, reason) values (auth.uid(), -amount, reason);
  return true;
end $$;

-- Purchases (the store webhook calls this with the service key).
create function public.grant_cores(player uuid, amount integer, reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.wallets (user_id, cores) values (player, amount)
    on conflict (user_id) do update set cores = public.wallets.cores + amount;
  insert into public.core_log (user_id, delta, reason) values (player, amount, reason);
end $$;

revoke execute on function public.grant_cores from anon, authenticated;
grant execute on function public.earn_cores, public.spend_cores to authenticated;
