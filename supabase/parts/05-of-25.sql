-- Endless Space database: part 5 of 25. Run the parts in order, 01 first.

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
drop function if exists public.leaderboard(text, text, smallint, integer);
