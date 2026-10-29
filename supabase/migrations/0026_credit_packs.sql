-- Credit packs (1.0.13): bought with money, paid on the server by the store's
-- webhook, like the cores packs. Credits otherwise live on the device and
-- sync_credits merges them (0007): whatever the server's balance gained since
-- the device last synced is added to the device's. So a pack is paid by adding
-- to the server's balance, and the device picks it up on its next sync.
--
-- Exactly once: the pack is paid in the same call that records the store
-- event, and an event already recorded (RevenueCat sending it again after a
-- timeout or a 500) pays nothing.
--
-- A player whose device has never synced credits has no server balance yet
-- (credits is null), and the first sync takes the device's balance as it is.
-- A pack bought then waits in credits_owed and is added on that first sync.

alter table public.wallets add column if not exists credits_owed bigint not null default 0 check (credits_owed >= 0);

-- Pay `amount` credits to a player on the server.
create or replace function public.give_credits(p_user uuid, amount bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or amount is null or amount <= 0 then return; end if;
  insert into public.wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  update public.wallets
    set credits = case when credits is null then null else credits + amount end,
        credits_owed = case when credits is null then credits_owed + amount else credits_owed end
    where user_id = p_user;
end $$;

revoke execute on function public.give_credits(uuid, bigint) from public, anon, authenticated; -- only the functions here call it

create or replace function public.store_credit_purchase(p_id text, p_user uuid, p_product text, p_type text, p_transaction text, p_credits integer, p_at timestamptz)
returns text language plpgsql security definer set search_path = public as $$
declare
  r text;
begin
  r := public.store_purchase_at(p_id, p_user, p_product, p_type, p_transaction, 0, p_at);
  if r = 'paid' then perform public.give_credits(p_user, p_credits); end if;
  return r;
end $$;

-- A refunded pack takes its credits back, as far as the balance allows.
create or replace function public.store_credit_refund(p_id text, p_user uuid, p_product text, p_transaction text, p_credits integer)
returns text language plpgsql security definer set search_path = public as $$
declare
  r text;
begin
  r := public.store_refund(p_id, p_user, p_product, p_transaction, 0);
  if r = 'refunded' and p_user is not null and coalesce(p_credits, 0) > 0 then
    update public.wallets
      set credits = case when credits is null then null else greatest(0, credits - p_credits) end,
          credits_owed = case when credits is null then greatest(0, credits_owed - p_credits) else credits_owed end
      where user_id = p_user;
  end if;
  return r;
end $$;

revoke execute on function public.store_credit_purchase, public.store_credit_refund from public, anon, authenticated;
grant execute on function public.store_credit_purchase, public.store_credit_refund to service_role;

-- As 0007, with what's owed added on the first sync.
create or replace function public.sync_credits(p_credits bigint, p_last bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  have bigint;
  owed bigint;
  keep bigint;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if p_credits is null or p_credits < 0 or p_credits > 1000000000 then
    raise exception 'not a balance' using errcode = '22023';
  end if;
  select credits, credits_owed into have, owed from public.wallets where user_id = auth.uid() for update;
  if not found then
    return p_credits;
  end if;
  if have is null then
    keep := p_credits + owed; -- the first sync: the device's balance, and any pack bought before it
  elsif p_last is null then
    keep := have; -- a device that has never synced: the server's
  else
    keep := greatest(0, p_credits + (have - p_last)); -- the device's, plus any change made on the server
  end if;
  update public.wallets set credits = keep, credits_owed = 0 where user_id = auth.uid();
  return keep;
end;
$$;

revoke execute on function public.sync_credits from public, anon;
grant execute on function public.sync_credits to authenticated;
