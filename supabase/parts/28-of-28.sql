-- Endless Space database: part 28 of 28. Run the parts in order, 01 first.

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
