-- Endless Space database: part 2 of 5. Run the parts in order, 01 first.

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

-- Store purchases from RevenueCat's webhook. Each event is kept once (by its
-- id), so a retried webhook never pays twice.

create table public.store_events (
  id text primary key,
  user_id uuid references auth.users on delete set null,
  product text not null,
  type text not null,
  at timestamptz not null default now()
);

alter table public.store_events enable row level security;

create policy "own purchases" on public.store_events for select using (auth.uid() = user_id);

-- Leaderboards: one table of each player's best per board, filled by submit_run
-- (which checks a run is possible) and read through leaderboard().
--
-- Boards:
--   ranked          the week's run, one board per week and league
--   endless         every area in turn, all time
--   solo:<env>      one environment endlessly, all time (open-ground, canyon,
--                   ship, ice, asteroids, volcanic)
--
-- Everything is plain SQL: there is no function to deploy.

-- Pilot names: shown on the boards. hidden takes a player off them.
alter table public.players add column hidden boolean not null default false;

alter table public.players add column name_changed_at timestamptz;

-- Every submitted run, kept for checking and clean-up. Written only by submit_run.
alter table public.runs add column board text not null default 'ranked';

create index runs_by_user on public.runs (user_id, at desc);
