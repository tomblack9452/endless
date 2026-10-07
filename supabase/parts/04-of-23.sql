-- Endless Space database: part 4 of 23. Run the parts in order, 01 first.

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
