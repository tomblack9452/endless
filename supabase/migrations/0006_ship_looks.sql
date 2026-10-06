-- Ships on the boards: each player's equipped looks (hull, paint, markings,
-- fins, decal, engine colour, trail, and the rank and league their badge
-- decals show), so the leaderboard can draw everyone's ship next to their name.

alter table public.players add column if not exists ship jsonb;

-- Set your own. Only the shape is checked (known slots, short ids, small
-- numbers): which looks a player owns lives on their device.
create or replace function public.set_ship(p_ship jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  k text;
  v jsonb;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if jsonb_typeof(p_ship) <> 'object' or octet_length(p_ship::text) > 400 then
    raise exception 'not a ship' using errcode = '22023';
  end if;
  for k, v in select * from jsonb_each(p_ship) loop
    if k in ('hull', 'paint', 'markings', 'fins', 'decal', 'engine', 'trail') then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^[a-z0-9-]{1,24}$' then
        raise exception 'not a look: %', k using errcode = '22023';
      end if;
    elsif k in ('rank', 'league', 'division') then
      if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric not between 0 and 99 then
        raise exception 'not a number: %', k using errcode = '22023';
      end if;
    else
      raise exception 'not a slot: %', k using errcode = '22023';
    end if;
  end loop;
  update public.players set ship = p_ship where user_id = auth.uid();
end;
$$;

revoke execute on function public.set_ship from public, anon;
grant execute on function public.set_ship to authenticated;

-- leaderboard() gains a ship column, so it's made again (a function's
-- columns can't change in place).
drop function if exists public.leaderboard(text, text, smallint, integer);

-- A board, best first: the top p_limit pilots and, if you are further down,
-- your own row at the end with your rank.
create function public.leaderboard(
  p_board text,
  p_period text default 'all',
  p_league smallint default 0,
  p_limit integer default 50
) returns table (rank bigint, name text, score integer, you boolean, premium boolean, ship jsonb)
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
           t.name, t.score, t.user_id = me, t.premium, t.ship
    from (
      select b.user_id, b.score, b.achieved_at, pl.name, pl.ship,
             exists (select 1 from public.store_events e where e.user_id = b.user_id and e.product = 'premium') as premium
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
      return query select my_rank, pl.name, mine.score, true,
        exists (select 1 from public.store_events e where e.user_id = me and e.product = 'premium'), pl.ship
        from public.players pl where pl.user_id = me;
    end if;
  end if;
end $$;

revoke execute on function public.leaderboard from public, anon;
grant execute on function public.leaderboard to authenticated;
