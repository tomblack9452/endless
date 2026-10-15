-- The daily challenge (1.0.8): one short course a day, the same for everyone,
-- seeded from the server's day, with a board of its own and a streak.
--
-- Board 'daily': period is the server's UTC date ('2026-10-15'), league 0.
-- check_run takes it with the same checks as ranked (the ship's path every few
-- units must match the distance and never jump), and one more: the daily
-- course is short (CONFIG.daily.length), so no run on it is longer.
-- submit_run files it under the day the server is on when it arrives; the game
-- drops a daily run still waiting in its outbox once that day is over, so a
-- run never lands on another day's board.
-- earn_cores takes 'daily:<date>', the streak's cores, like the login reward:
-- today's date (a day either side), once a day, 3 at most.
-- Every other rule in these is as 0003, 0015 and 0016 left them.

-- The day a moment falls in (UTC), as the daily board's period.
create or replace function public.daily_period(p_at timestamptz) returns text
language sql immutable as $$
  select ((p_at at time zone 'utc')::date)::text
$$;

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
  c_daily_length constant numeric := 3700;     -- CONFIG.daily.length, and a little over for the line itself
begin
  if p_board !~ '^(ranked|daily|endless|solo:(open-ground|canyon|ship|ice|asteroids|volcanic))$' then
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
  if p_board = 'ranked' and (p_league is null or p_league < 0 or p_league > 6) then
    raise exception 'bad league' using errcode = '22023';
  end if;
  if p_board = 'daily' and p_distance > c_daily_length then
    raise exception 'longer than the daily course' using errcode = '22023';
  end if;
  if p_board in ('ranked', 'daily') then
    -- Ranked and daily runs carry the ship's path, one sample every few units.
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

revoke execute on function public.check_run from public, anon, authenticated; -- only submit_run calls it

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
  elsif p_board = 'daily' then
    per := public.daily_period(now()); -- the server's day, not the phone's
    lg := 0;
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

revoke execute on function public.submit_run from public, anon;
grant execute on function public.submit_run to authenticated;

create or replace function public.earn_cores(amount integer, reason text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  kind text := split_part(coalesce(reason, ''), ':', 1);
  rest text := substr(coalesce(reason, ''), length(split_part(coalesce(reason, ''), ':', 1)) + 2);
  today date := (now() at time zone 'utc')::date;
  season integer := floor((today - date '2026-09-14') / 42) + 1; -- six-week seasons (src/season.ts)
  day date;
  most integer;
  give integer;
  so_far integer;
begin
  if me is null or amount is null or amount <= 0 then return 0; end if;
  -- One at a time per player: the checks below then see any reward paid a moment ago.
  perform 1 from public.wallets w where w.user_id = me for update;
  if not found then return 0; end if;
  -- Each reward is paid once.
  if exists (select 1 from public.core_log l where l.user_id = me and l.reason = earn_cores.reason) then return 0; end if;

  if kind in ('login', 'gift', 'goals', 'weekly', 'daily') then
    -- A UTC date: today's (a day either side for time zones and midnight), or this week's Monday.
    if rest !~ '^\d{4}-\d{2}-\d{2}$' then return 0; end if;
    begin
      day := rest::date;
    exception when others then
      return 0;
    end;
    if day > today + 1 then return 0; end if; -- the future, beyond a day
    if kind = 'weekly' then
      if extract(isodow from day) <> 1 or day < today - 8 then return 0; end if;
    elsif day < today - 1 then
      return 0;
    end if;
    -- daily: the challenge streak's cores (CONFIG.daily.streak; tests/sql.test.ts checks).
    most := case kind when 'login' then 15 when 'gift' then 2 when 'goals' then 4 when 'daily' then 3 else 15 end;
  elsif kind = 'pass' then
    -- "pass:<season>:<f|p><tier>", this season, and no more than the whole pass pays.
    if rest !~ ('^' || season || ':[fp]([1-9]|[12][0-9]|30)$') then return 0; end if;
    -- A refunded pass pays no more premium tiers.
    if rest ~ ':p' and public.pass_refunded(me, season) then return 0; end if;
    select coalesce(sum(l.delta), 0) into so_far from public.core_log l
      where l.user_id = me and l.reason like 'pass:' || season || ':%';
    most := least(50, 300 - so_far);
  elsif kind = 'set' then
    -- A completed looks set's bonus (SETS in src/catalogue.ts).
    if rest not in ('forge', 'deep', 'neon', 'royal', 'toxic', 'sunset') then return 0; end if;
    most := 40;
  elsif kind = 'tickets' and rest = '' then
    most := 300; -- the one-off refund for spare ranked tickets (src/legacy.ts)
  else
    return 0;
  end if;

  give := greatest(0, least(amount, most));
  if give = 0 then return 0; end if;
  update public.wallets set cores = cores + give where user_id = me;
  insert into public.core_log (user_id, delta, reason) values (me, give, earn_cores.reason);
  return give;
end $$;

revoke execute on function public.earn_cores from public, anon;
grant execute on function public.earn_cores to authenticated;
