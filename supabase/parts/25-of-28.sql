-- Endless Space database: part 25 of 28. Run the parts in order, 01 first.

create or replace function public.store_purchase(p_id text, p_user uuid, p_product text, p_type text, p_transaction text, p_cores integer)
returns text language plpgsql security definer set search_path = public as $$
begin
  insert into public.store_events (id, user_id, product, type, transaction_id)
  values (p_id, p_user, p_product, p_type, p_transaction)
  on conflict (id) do nothing;
  if not found then return 'duplicate'; end if;
  if p_user is not null and coalesce(p_cores, 0) > 0 then
    insert into public.wallets (user_id, cores) values (p_user, p_cores)
      on conflict (user_id) do update set cores = public.wallets.cores + p_cores;
    insert into public.core_log (user_id, delta, reason) values (p_user, p_cores, 'purchase:' || p_product);
  end if;
  return 'paid';
end $$;

create or replace function public.store_refund(p_id text, p_user uuid, p_product text, p_transaction text, p_cores integer)
returns text language plpgsql security definer set search_path = public as $$
declare
  bought text;
begin
  insert into public.store_events (id, user_id, product, type, transaction_id)
  values (p_id, p_user, 'refund:' || p_product, 'CANCELLATION', p_transaction)
  on conflict (id) do nothing;
  if not found then return 'duplicate'; end if;
  select e.id into bought from public.store_events e
    where e.product = p_product and e.user_id is not distinct from p_user
      and (p_transaction is null or e.transaction_id is null or e.transaction_id = p_transaction)
    order by (e.transaction_id = p_transaction) desc nulls last, e.at desc
    limit 1;
  if bought is null then return 'not found'; end if;
  update public.store_events set product = 'refunded:' || product where id = bought;
  if p_user is not null and coalesce(p_cores, 0) > 0 then
    update public.wallets set cores = greatest(0, cores - p_cores) where user_id = p_user;
    insert into public.core_log (user_id, delta, reason) values (p_user, -p_cores, 'refund:' || p_product);
  end if;
  return 'refunded';
end $$;

revoke execute on function public.store_purchase, public.store_refund from public, anon, authenticated;

grant execute on function public.store_purchase, public.store_refund, public.grant_cores to service_role;

-- A clock the game can trust for daily rewards.
--
-- server_now: the server's time, for the game to keep its days and weeks by
-- (src/server/supabase.ts) instead of a phone's clock, which can be moved.
-- Anyone may ask, before signing in too.
--
-- earn_cores: every rule from 0010 kept, and the date-keyed rewards (login:,
-- gift:, goals:, weekly:) checked more strictly:
--   * a date that isn't real ("2026-02-30") is turned down, not an error;
--   * nothing dated more than a day ahead of the server's UTC date (the day
--     either side still covers time zones ahead of UTC, and midnight);
--   * weekly: only a Monday (the week's key), so one week can't be claimed as
--     seven different days.

create or replace function public.server_now() returns timestamptz
language sql stable as $$ select now() $$;

revoke execute on function public.server_now() from public;

grant execute on function public.server_now() to anon, authenticated;
