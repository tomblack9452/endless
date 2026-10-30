-- Store offers (1.0.14).
--
-- 1. First purchase doubled: a player's first pack of credits or cores
--    (cores_* and credits_*, not the starter pack, premium or the pass) pays
--    double. The webhook calls store_pack_purchase for every pack; it decides
--    "first" and pays in the same call that records the store event, under a
--    lock on the player's wallet, so a resent event (already recorded) or two
--    purchases at once can't double twice. A pack bought and refunded still
--    counts as bought: the next one isn't "first". The purchase row is marked
--    `doubled`, and store_pack_refund takes back what it really paid.
-- 2. Sales Tom schedules: rows in store_sales (from the dashboard's Table
--    Editor), and store_sales_now() for the game, which returns only the ones
--    running by the server's clock. The discount itself is set in Play Console.
--
-- store_purchase_at, store_refund, store_credit_purchase and
-- store_credit_refund stay as they were, for the webhook deployed before this.

alter table public.store_events add column if not exists doubled boolean not null default false;

create or replace function public.store_pack_purchase(
  p_id text, p_user uuid, p_product text, p_type text, p_transaction text, p_cores integer, p_credits integer, p_at timestamptz
) returns text language plpgsql security definer set search_path = public as $$
declare
  times integer := 1;
  r text;
begin
  if p_user is not null then
    insert into public.wallets (user_id) values (p_user) on conflict (user_id) do nothing;
    perform 1 from public.wallets w where w.user_id = p_user for update;
    if not exists (
      select 1 from public.store_events e
      where e.user_id = p_user and e.product ~ '^(refund:|refunded:)?(cores|credits)_[0-9]+$'
    ) then
      times := 2;
    end if;
  end if;
  r := public.store_purchase_at(p_id, p_user, p_product, p_type, p_transaction, coalesce(p_cores, 0) * times, p_at);
  if r = 'paid' then
    perform public.give_credits(p_user, coalesce(p_credits, 0)::bigint * times);
    if times = 2 then update public.store_events set doubled = true where id = p_id; end if;
  end if;
  return r;
end $$;

create or replace function public.store_pack_refund(p_id text, p_user uuid, p_product text, p_transaction text, p_cores integer, p_credits integer)
returns text language plpgsql security definer set search_path = public as $$
declare
  times integer := 1;
  r text;
begin
  -- The purchase store_refund will find (the same match it makes): was it doubled?
  select case when e.doubled then 2 else 1 end into times from public.store_events e
    where e.product = p_product and e.user_id is not distinct from p_user
      and (p_transaction is null or e.transaction_id is null or e.transaction_id = p_transaction)
    order by (e.transaction_id = p_transaction) desc nulls last, e.at desc
    limit 1;
  times := coalesce(times, 1);
  r := public.store_refund(p_id, p_user, p_product, p_transaction, coalesce(p_cores, 0) * times);
  if r = 'refunded' and p_user is not null and coalesce(p_credits, 0) > 0 then
    update public.wallets
      set credits = case when credits is null then null else greatest(0, credits - p_credits::bigint * times) end,
          credits_owed = case when credits is null then greatest(0, credits_owed - p_credits::bigint * times) else credits_owed end
      where user_id = p_user;
  end if;
  return r;
end $$;

revoke execute on function public.store_pack_purchase, public.store_pack_refund from public, anon, authenticated;
grant execute on function public.store_pack_purchase, public.store_pack_refund to service_role;

create table if not exists public.store_sales (
  id bigserial primary key,
  product text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  label text not null default 'sale',
  check (ends_at > starts_at)
);
-- Written from the dashboard only: no access for the game's keys.
alter table public.store_sales enable row level security;
revoke all on public.store_sales from anon, authenticated;

create or replace function public.store_sales_now()
returns table (product text, label text, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.product, s.label, s.ends_at from public.store_sales s
  where now() >= s.starts_at and now() < s.ends_at
  order by s.ends_at
$$;

revoke execute on function public.store_sales_now() from public;
grant execute on function public.store_sales_now() to anon, authenticated;
