-- Ghost rivals (1.0.9): in ranked, the game can fly the ghost of the pilot
-- ranked just above you on your league's board this week, as well as your own
-- weekly best. Off by default (settings > display > rival's ghost).
--
-- rival_path() returns that pilot's best run this week: their public pilot
-- name, the score, time and distance, and the path (the ship's sideways
-- position every 4 units, which ranked runs carry since 0003). Nothing else
-- about them: no account id, no public id. The board is the caller's league
-- (players.league, 0015; from their latest ranked run before that, else
-- bronze) and the server's week. "Just above" is in the board's own order
-- (score, then who got there first). A caller with no run this week gets the
-- pilot at the bottom of the board, the first to beat; the top pilot gets
-- nothing. Hidden pilots are never a rival.

create or replace function public.rival_path()
returns table (name text, score integer, seconds real, distance real, path real[])
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  week_start date := (date_trunc('week', now() at time zone 'utc'))::date;
  per text := (date_trunc('week', now() at time zone 'utc'))::date::text;
  lg smallint;
  mine public.bests;
  rival uuid;
  rival_score integer;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  select pl.league into lg from public.players pl where pl.user_id = me;
  if lg is null then
    select r.league into lg from public.runs r
      where r.user_id = me and r.board = 'ranked' order by r.at desc, r.id desc limit 1;
  end if;
  lg := coalesce(lg, 0);
  select * into mine from public.bests b
    where b.board = 'ranked' and b.period = per and b.league = lg and b.user_id = me;
  select b.user_id, b.score into rival, rival_score
  from public.bests b join public.players pl on pl.user_id = b.user_id and not pl.hidden
  where b.board = 'ranked' and b.period = per and b.league = lg and b.user_id <> me
    and (mine.user_id is null
      or b.score > mine.score
      or (b.score = mine.score and (b.achieved_at < mine.achieved_at
        or (b.achieved_at = mine.achieved_at and b.user_id < me))))
  order by b.score, b.achieved_at desc, b.user_id desc
  limit 1;
  if rival is null then return; end if;
  return query
    select pl.name, r.score, r.seconds, r.distance, r.path
    from public.runs r join public.players pl on pl.user_id = r.user_id
    where r.user_id = rival and r.board = 'ranked' and r.week = week_start and r.league = lg and r.score = rival_score
    order by r.at, r.id
    limit 1;
end $$;

revoke execute on function public.rival_path() from public, anon;
grant execute on function public.rival_path() to authenticated;
