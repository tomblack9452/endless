-- Endless Space database: part 9 of 23. Run the parts in order, 01 first.

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

-- Credits on the server too, next to cores, so a balance can be changed from
-- the dashboard (Table Editor > wallets > credits). Credits are still earned
-- and spent on the device; sync_credits merges the two: whatever changed on
-- the server since the device last synced is added to the device's balance.

alter table public.wallets add column if not exists credits bigint check (credits >= 0);
