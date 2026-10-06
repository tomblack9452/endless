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
alter table public.players add column if not exists hidden boolean not null default false;
alter table public.players add column if not exists name_changed_at timestamptz;

-- Every submitted run, kept for checking and clean-up. Written only by submit_run.
alter table public.runs add column if not exists board text not null default 'ranked';
create index if not exists runs_by_user on public.runs (user_id, at desc);

-- The best run per player on each board (period is the week's Monday for
-- ranked, 'all' for the rest; league is 0 outside ranked).
create table if not exists public.bests (
  board text not null,
  period text not null,
  league smallint not null default 0,
  user_id uuid not null references auth.users on delete cascade,
  score integer not null,
  seconds real not null,
  achieved_at timestamptz not null default now(),
  primary key (board, period, league, user_id)
);
create index if not exists bests_top on public.bests (board, period, league, score desc, achieved_at);

alter table public.bests enable row level security; -- no policies: read through leaderboard()

-- Carry over what the old board view showed.
insert into public.bests (board, period, league, user_id, score, seconds, achieved_at)
select distinct on (week, league, user_id) 'ranked', week::text, league, user_id, score, seconds, at
from public.runs
order by week, league, user_id, score desc, at
on conflict do nothing;

drop view if exists public.board;

-- The checks on a run: is it possible? (not that it's honest: a full re-fly on the
-- server is the next step, see docs/leaderboards.md). Raises a reason if not.
create or replace function public.check_run(
  p_board text,
  p_league smallint,
  p_score integer,
  p_seconds real,
  p_distance real,
  p_path real[]
) returns void
language plpgsql immutable as $$
declare
  -- Keep these in step with CONFIG (tests/sql.test.ts checks).
  c_points_per_unit constant numeric := 0.85;  -- CONFIG.score.pointsPerUnit
  c_bonus_share constant numeric := 1.5;       -- pickups, near-miss chains and boost on top of distance (generous)
  c_top_speed constant numeric := 115;         -- units/s: CONFIG.speed.max with full boost, plus a margin
  c_path_step constant integer := 4;           -- units of distance per path sample
  c_max_sideways constant numeric := 12;       -- sideways travel per path sample, at most
begin
  if p_board !~ '^(ranked|endless|solo:(open-ground|canyon|ship|ice|asteroids|volcanic))$' then
    raise exception 'unknown board' using errcode = '22023';
  end if;
  if p_score is null or p_seconds is null or p_distance is null or p_score < 0 or p_score > 50000000 then
    raise exception 'bad score' using errcode = '22023';
  end if;
  if p_seconds < 5 or p_seconds > 21600 or p_distance <= 0 then
    raise exception 'bad time or distance' using errcode = '22023';
  end if;
  if p_score > p_distance * c_points_per_unit * (1 + c_bonus_share) + 500 then
    raise exception 'score too high for the distance' using errcode = '22023';
  end if;
  if p_distance / greatest(0.1, p_seconds) > c_top_speed then
    raise exception 'too fast' using errcode = '22023';
  end if;
  if p_board = 'ranked' then
    if p_league is null or p_league < 0 or p_league > 6 then
      raise exception 'bad league' using errcode = '22023';
    end if;
    -- Ranked runs carry the ship's path (the ghost), one sample every few units.
    if abs(coalesce(array_length(p_path, 1), 0) - ceil(p_distance / c_path_step)) > 2 then
      raise exception 'path does not match the distance' using errcode = '22023';
    end if;
    if exists (
      select 1 from generate_subscripts(p_path, 1) i
      where i > 1 and abs(p_path[i] - p_path[i - 1]) > c_max_sideways
    ) then
      raise exception 'path jumps' using errcode = '22023';
    end if;
  end if;
end $$;

-- Submit a finished run: checks it, keeps it if it is a best, and says where it ranks.
create or replace function public.submit_run(
  p_board text,
  p_league smallint,
  p_score integer,
  p_seconds real,
  p_distance real,
  p_finished boolean,
  p_path real[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_min_gap constant interval := interval '8 seconds'; -- between submissions from one player
  c_max_per_day constant integer := 400;
  me uuid := auth.uid();
  week_start date := (date_trunc('week', now() at time zone 'utc'))::date;
  per text;
  lg smallint;
  last_at timestamptz;
  today integer;
  old_best integer;
  now_rank integer;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  perform public.check_run(p_board, p_league, p_score, p_seconds, p_distance, p_path);
  if p_board = 'ranked' then
    per := week_start::text;
    lg := p_league;
  else
    per := 'all';
    lg := 0;
  end if;

  -- Rate limits: a run takes at least a few seconds, so faster is a script.
  select max(at), count(*) filter (where at > now() - interval '1 day') into last_at, today
  from public.runs where user_id = me;
  if last_at is not null and now() - last_at < c_min_gap then
    raise exception 'too many runs too quickly' using errcode = '22023';
  end if;
  if today >= c_max_per_day then
    raise exception 'too many runs today' using errcode = '22023';
  end if;

  insert into public.runs (user_id, week, league, score, seconds, distance, finished, path, board)
  values (me, week_start, lg, p_score, p_seconds, p_distance, p_finished, coalesce(p_path, '{}'), p_board);

  select score into old_best from public.bests
  where board = p_board and period = per and league = lg and user_id = me;
  if old_best is null or p_score > old_best then
    insert into public.bests (board, period, league, user_id, score, seconds)
    values (p_board, per, lg, me, p_score, p_seconds)
    on conflict (board, period, league, user_id)
    do update set score = excluded.score, seconds = excluded.seconds, achieved_at = now();
  end if;

  select 1 + count(*) into now_rank
  from public.bests b join public.players pl on pl.user_id = b.user_id and not pl.hidden
  where b.board = p_board and b.period = per and b.league = lg
    and b.score > greatest(p_score, coalesce(old_best, 0));

  return jsonb_build_object(
    'rank', now_rank,
    'best', greatest(p_score, coalesce(old_best, 0)),
    'newBest', old_best is null or p_score > old_best
  );
end $$;

-- A board, best first: the top p_limit pilots and, if you are further down,
-- your own row at the end with your rank.
drop function if exists public.leaderboard(text, text, smallint, integer); -- its columns change in 0004
create function public.leaderboard(
  p_board text,
  p_period text default 'all',
  p_league smallint default 0,
  p_limit integer default 50
) returns table (rank bigint, name text, score integer, you boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  n integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  mine public.bests;
  my_rank bigint;
begin
  return query
    select (row_number() over (order by t.score desc, t.achieved_at, t.user_id))::bigint,
           t.name, t.score, t.user_id = me
    from (
      select b.user_id, b.score, b.achieved_at, pl.name
      from public.bests b join public.players pl on pl.user_id = b.user_id and not pl.hidden
      where b.board = p_board and b.period = p_period and b.league = p_league
      order by b.score desc, b.achieved_at, b.user_id
      limit n
    ) t
    order by 1;

  select * into mine from public.bests b
  where b.board = p_board and b.period = p_period and b.league = p_league and b.user_id = me;
  if found then
    select 1 + count(*) into my_rank
    from public.bests b join public.players pl on pl.user_id = b.user_id and not pl.hidden
    where b.board = p_board and b.period = p_period and b.league = p_league
      and (b.score > mine.score
        or (b.score = mine.score and (b.achieved_at < mine.achieved_at
          or (b.achieved_at = mine.achieved_at and b.user_id < me))));
    if my_rank > n then
      return query select my_rank, (select pl.name from public.players pl where pl.user_id = me), mine.score, true;
    end if;
  end if;
end $$;

-- Change your pilot name: 3 to 16 letters, numbers, spaces, - or _; not taken;
-- once an hour at most.
create or replace function public.set_pilot_name(p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  clean text := btrim(coalesce(p_name, ''));
  changed timestamptz;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if clean !~ '^[A-Za-z0-9_ -]{3,16}$' then
    raise exception 'use 3 to 16 letters, numbers, spaces, - or _' using errcode = '22023';
  end if;
  if exists (select 1 from public.players where lower(name) = lower(clean) and user_id <> me) then
    raise exception 'that name is taken' using errcode = '22023';
  end if;
  select name_changed_at into changed from public.players where user_id = me;
  if changed is not null and now() - changed < interval '1 hour' then
    raise exception 'you can change your name once an hour' using errcode = '22023';
  end if;
  update public.players set name = clean, name_changed_at = now() where user_id = me;
  return clean;
end $$;

revoke execute on function public.check_run from public, anon, authenticated; -- only submit_run calls it
revoke execute on function public.submit_run, public.leaderboard, public.set_pilot_name from public, anon;
grant execute on function public.submit_run, public.leaderboard, public.set_pilot_name to authenticated;
