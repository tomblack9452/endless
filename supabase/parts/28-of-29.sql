-- Endless Space database: part 28 of 29. Run the parts in order, 01 first.

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

-- Two fixes from the audit.
--
-- 1. store_purchase_at keeps when the purchase was made (RevenueCat's
--    purchased_at_ms), not when the webhook happened to arrive. A season pass
--    bought in the last minutes of a season, delivered after it ended, still
--    counts for the season it was bought in (passBought in src/economy/pass.ts).
--    The webhook now calls store_purchase_at; store_purchase stays for the
--    webhook deployed before this. Apply this before deploying the new one.
-- 2. earn_cores takes a lock on the player's wallet first, so two calls at the
--    same moment with the same reason can't both pass the "paid once" check
--    (or both fit under the pass's season cap). Every rule is as 0012 left it.

create or replace function public.store_purchase_at(p_id text, p_user uuid, p_product text, p_type text, p_transaction text, p_cores integer, p_at timestamptz)
returns text language plpgsql security definer set search_path = public as $$
begin
  insert into public.store_events (id, user_id, product, type, transaction_id, at)
  values (p_id, p_user, p_product, p_type, p_transaction, least(coalesce(p_at, now()), now()))
  on conflict (id) do nothing;
  if not found then return 'duplicate'; end if;
  if p_user is not null and coalesce(p_cores, 0) > 0 then
    insert into public.wallets (user_id, cores) values (p_user, p_cores)
      on conflict (user_id) do update set cores = public.wallets.cores + p_cores;
    insert into public.core_log (user_id, delta, reason) values (p_user, p_cores, 'purchase:' || p_product);
  end if;
  return 'paid';
end $$;

-- The webhook from before this keeps working: the same, with the time it arrived.
create or replace function public.store_purchase(p_id text, p_user uuid, p_product text, p_type text, p_transaction text, p_cores integer)
returns text language sql security definer set search_path = public as $$
  select public.store_purchase_at(p_id, p_user, p_product, p_type, p_transaction, p_cores, null);
$$;

revoke execute on function public.store_purchase_at, public.store_purchase from public, anon, authenticated;

grant execute on function public.store_purchase_at, public.store_purchase to service_role;
