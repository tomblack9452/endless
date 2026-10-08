-- Service records on the boards: tap a pilot to see their rank and stats.
--
-- Each player sends a small summary of their own service record (rank, xp,
-- lifetime stats) with set_record, kept on their players row. The boards hand
-- out a public id per pilot (never the account id), and pilot_record() reads a
-- pilot's card by it: name, premium, ship, that summary, and their bests.

alter table public.players add column if not exists public_id uuid not null default gen_random_uuid();
create unique index if not exists players_public_id on public.players (public_id);
alter table public.players add column if not exists record jsonb;

-- Set your own. Only the shape is checked (an object of numbers, small): the
-- stats live on the device, and the card only shows them.
create or replace function public.set_record(p_record jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  k text;
  v jsonb;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if jsonb_typeof(p_record) <> 'object' or octet_length(p_record::text) > 600 then
    raise exception 'not a record' using errcode = '22023';
  end if;
  for k, v in select * from jsonb_each(p_record) loop
    if length(k) > 24 or jsonb_typeof(v) <> 'number' then
      raise exception 'not a record' using errcode = '22023';
    end if;
  end loop;
  update public.players set record = p_record where user_id = auth.uid();
end $$;

revoke execute on function public.set_record(jsonb) from public, anon;
grant execute on function public.set_record(jsonb) to authenticated;

-- leaderboard() gains the pilot's public id, so it's made again.
drop function if exists public.leaderboard(text, text, smallint, integer);

-- A board, best first: the top p_limit pilots and, if you are further down,
-- your own row at the end with your rank.
create function public.leaderboard(
  p_board text,
  p_period text default 'all',
  p_league smallint default 0,
  p_limit integer default 50
) returns table (rank bigint, name text, score integer, you boolean, premium boolean, ship jsonb, pid uuid)
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
           t.name, t.score, t.user_id = me, t.premium, t.ship, t.public_id
    from (
      select b.user_id, b.score, b.achieved_at, pl.name, pl.ship, pl.public_id,
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
        exists (select 1 from public.store_events e where e.user_id = me and e.product = 'premium'), pl.ship, pl.public_id
        from public.players pl where pl.user_id = me;
    end if;
  end if;
end $$;

revoke execute on function public.leaderboard from public, anon;
grant execute on function public.leaderboard to authenticated;

-- A pilot's card, by the public id the boards give: null for a hidden or
-- unknown pilot. bests: the all-time best on each board, and ranked's best week.
create or replace function public.pilot_record(p_pid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', pl.name,
    'premium', exists (select 1 from public.store_events e where e.user_id = pl.user_id and e.product = 'premium'),
    'ship', pl.ship,
    'record', coalesce(pl.record, '{}'::jsonb),
    'since', extract(epoch from pl.created_at) * 1000,
    'bests', coalesce((
      select jsonb_object_agg(x.board, x.score)
      from (
        select b.board, max(b.score) as score from public.bests b
        where b.user_id = pl.user_id
        group by b.board
      ) x
    ), '{}'::jsonb)
  )
  from public.players pl
  where pl.public_id = p_pid and not pl.hidden;
$$;

revoke execute on function public.pilot_record(uuid) from public, anon;
grant execute on function public.pilot_record(uuid) to authenticated;
