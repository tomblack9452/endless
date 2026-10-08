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

create or replace function public.earn_cores(amount integer, reason text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  kind text := split_part(coalesce(reason, ''), ':', 1);
  rest text := substr(coalesce(reason, ''), length(split_part(coalesce(reason, ''), ':', 1)) + 2);
  today date := (now() at time zone 'utc')::date;
  season integer := floor((today - date '2026-09-14') / 42) + 1; -- six-week seasons (src/season.ts)
  day date;
  most integer;
  give integer;
  so_far integer;
begin
  if me is null or amount is null or amount <= 0 then return 0; end if;
  -- One at a time per player: the checks below then see any reward paid a moment ago.
  perform 1 from public.wallets w where w.user_id = me for update;
  if not found then return 0; end if;
  -- Each reward is paid once.
  if exists (select 1 from public.core_log l where l.user_id = me and l.reason = earn_cores.reason) then return 0; end if;

  if kind in ('login', 'gift', 'goals', 'weekly') then
    -- A UTC date: today's (a day either side for time zones and midnight), or this week's Monday.
    if rest !~ '^\d{4}-\d{2}-\d{2}$' then return 0; end if;
    begin
      day := rest::date;
    exception when others then
      return 0;
    end;
    if day > today + 1 then return 0; end if; -- the future, beyond a day
    if kind = 'weekly' then
      if extract(isodow from day) <> 1 or day < today - 8 then return 0; end if;
    elsif day < today - 1 then
      return 0;
    end if;
    most := case kind when 'login' then 15 when 'gift' then 2 when 'goals' then 4 else 15 end;
  elsif kind = 'pass' then
    -- "pass:<season>:<f|p><tier>", this season, and no more than the whole pass pays.
    if rest !~ ('^' || season || ':[fp]([1-9]|[12][0-9]|30)$') then return 0; end if;
    select coalesce(sum(l.delta), 0) into so_far from public.core_log l
      where l.user_id = me and l.reason like 'pass:' || season || ':%';
    most := least(50, 300 - so_far);
  elsif kind = 'set' then
    -- A completed looks set's bonus (SETS in src/catalogue.ts).
    if rest not in ('forge', 'deep', 'neon', 'royal', 'toxic', 'sunset') then return 0; end if;
    most := 40;
  elsif kind = 'tickets' and rest = '' then
    most := 300; -- the one-off refund for spare ranked tickets (src/legacy.ts)
  else
    return 0;
  end if;

  give := greatest(0, least(amount, most));
  if give = 0 then return 0; end if;
  update public.wallets set cores = cores + give where user_id = me;
  insert into public.core_log (user_id, delta, reason) values (me, give, earn_cores.reason);
  return give;
end $$;

revoke execute on function public.earn_cores from public, anon;
grant execute on function public.earn_cores to authenticated;
