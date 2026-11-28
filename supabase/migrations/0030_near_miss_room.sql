-- Room for near misses (1.0.16): check_run turned down any run scoring more
-- than about 2.1 points a unit of distance, but a near-miss chain pays up to 250
-- a link, so pilots who fly close (the game's whole point) scored past it and
-- their best runs never reached the boards. The limit is now about 17.9 a unit,
-- plus 2,000. Every other check is as 0019 left it.

create or replace function public.check_run(
  p_board text,
  p_league smallint,
  p_score integer,
  p_seconds real,
  p_distance real,
  p_path real[]
) returns void
language plpgsql immutable set search_path = public as $$
declare
  -- Keep these in step with CONFIG (tests/sql.test.ts checks).
  c_points_per_unit constant numeric := 0.85;  -- CONFIG.score.pointsPerUnit
  -- Bonus on top of distance: boost and double points (2.55 a unit at most), and near-miss
  -- chains (up to 250 each, doubled), which close fliers string together all run.
  c_bonus_share constant numeric := 20;
  c_bonus_floor constant numeric := 2000;      -- a short run with a few long chains
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
  if p_score > p_distance * c_points_per_unit * (1 + c_bonus_share) + c_bonus_floor then
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
