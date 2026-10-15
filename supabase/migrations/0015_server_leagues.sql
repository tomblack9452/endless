-- Leagues on the server: the ranked board no longer takes the game's word for
-- which league a run belongs to (the open item from the second audit).
--
-- players.league is the league the server holds each player in. Leagues never
-- drop, and the game promotes one league at a time (src/progression/leagues.ts),
-- so submit_run checks a ranked run's league against it:
--   * no league kept yet (players from before this): it's seeded from their
--     latest ranked run, or, with none, from this run;
--   * the same league: as before;
--   * a lower league: the run goes on their own league's board instead (a run
--     sent late, from before a promotion, still counts somewhere fair);
--   * the next league up: a promotion, kept if they have flown enough ranked
--     runs in their league to have filled its three divisions (12: 300 LP at
--     25 LP a run at most); otherwise turned down;
--   * anything higher: turned down.
-- take_max_out (0008) also puts the player in the top league.
-- Every other rule in submit_run is as 0003 left it.

alter table public.players add column if not exists league smallint;

-- The league a ranked run counts in (and the player's league from now on), or
-- an error if they can't be in the league the game says.
create or replace function public.ranked_league(me uuid, p_league smallint) returns smallint
language plpgsql security definer set search_path = public as $$
declare
  c_runs_to_promote constant integer := 12; -- keep in step with leagues.ts (tests/leagues.test.ts checks)
  held smallint;
begin
  -- One at a time per player, so two runs at once can't both promote.
  select pl.league into held from public.players pl where pl.user_id = me for update;
  if held is null then
    select r.league into held from public.runs r
      where r.user_id = me and r.board = 'ranked' order by r.at desc, r.id desc limit 1;
    held := coalesce(held, p_league);
  end if;
  if p_league = held + 1 then
    if (select count(*) from public.runs r where r.user_id = me and r.board = 'ranked' and r.league = held) < c_runs_to_promote then
      raise exception 'not in that league yet' using errcode = '22023';
    end if;
    held := p_league;
  elsif p_league > held then
    raise exception 'not in that league yet' using errcode = '22023';
  end if;
  update public.players set league = held where user_id = me;
  return held;
end $$;

revoke execute on function public.ranked_league(uuid, smallint) from public, anon, authenticated; -- only submit_run calls it

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

  -- Rate limits: a run takes at least a few seconds, so faster is a script.
  select max(at), count(*) filter (where at > now() - interval '1 day') into last_at, today
  from public.runs where user_id = me;
  if last_at is not null and now() - last_at < c_min_gap then
    raise exception 'too many runs too quickly' using errcode = '22023';
  end if;
  if today >= c_max_per_day then
    raise exception 'too many runs today' using errcode = '22023';
  end if;

  if p_board = 'ranked' then
    per := week_start::text;
    lg := public.ranked_league(me, p_league);
  else
    per := 'all';
    lg := 0;
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
  ) || case when p_board = 'ranked' then jsonb_build_object('league', lg) else '{}'::jsonb end;
end $$;

-- Maxing out from the SQL editor gives the top league on the device: the server's follows.
create or replace function public.take_max_out() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  was boolean;
begin
  update public.players set max_out = false, league = 6
  where user_id = auth.uid() and max_out
  returning true into was;
  return coalesce(was, false);
end;
$$;

revoke execute on function public.submit_run, public.take_max_out from public, anon;
grant execute on function public.submit_run, public.take_max_out to authenticated;
