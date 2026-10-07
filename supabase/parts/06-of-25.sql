-- Endless Space database: part 6 of 25. Run the parts in order, 01 first.

-- its columns change in 0004
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

revoke execute on function public.check_run from public, anon, authenticated;

-- only submit_run calls it
revoke execute on function public.submit_run, public.leaderboard, public.set_pilot_name from public, anon;

grant execute on function public.submit_run, public.leaderboard, public.set_pilot_name to authenticated;

-- Premium: the one-off purchase that removes ads and gives premium looks. The
-- purchase webhook already keeps every purchase in store_events, so owning
-- premium is a row there; a player reads their own (see the "own purchases"
-- policy), and the boards show a badge for it.

create index if not exists store_events_by_user on public.store_events (user_id, product);
