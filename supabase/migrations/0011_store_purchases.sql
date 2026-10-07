-- Purchases, safely (assessment items 4 and 5).
--
-- store_purchase: the webhook's one call per paid event. Keeping the event and
-- paying its cores happen in one transaction, so a failure leaves nothing
-- behind and RevenueCat's retry pays it properly; a repeat of an event that
-- went through answers 'duplicate'.
--
-- store_refund: a refunded purchase. Its row is renamed 'refunded:<product>',
-- so premium and the starter pack stop counting everywhere that looks for the
-- product (the boards' badge, the game's purchases()), and refunded cores are
-- taken back (the balance can't go below zero).
-- Both are for the webhook's service key only.

alter table public.store_events add column if not exists transaction_id text;

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
