-- Endless Space database: part 24 of 28. Run the parts in order, 01 first.

create or replace function public.earn_cores(amount integer, reason text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  kind text := split_part(coalesce(reason, ''), ':', 1);
  rest text := substr(coalesce(reason, ''), length(split_part(coalesce(reason, ''), ':', 1)) + 2);
  today date := (now() at time zone 'utc')::date;
  season integer := floor((today - date '2026-09-14') / 42) + 1; -- six-week seasons (src/season.ts)
  most integer;
  give integer;
  so_far integer;
begin
  if me is null or amount is null or amount <= 0 then return 0; end if;
  -- Each reward is paid once.
  if exists (select 1 from public.core_log l where l.user_id = me and l.reason = earn_cores.reason) then return 0; end if;

  if kind in ('login', 'gift', 'goals', 'weekly') then
    -- A UTC date: today's (a day either side for clocks and midnight), or this week's Monday.
    if rest !~ '^\d{4}-\d{2}-\d{2}$' then return 0; end if;
    if kind = 'weekly' then
      if rest::date not between today - 8 and today + 1 then return 0; end if;
    elsif rest::date not between today - 1 and today + 1 then
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
  if not found then return 0; end if;
  insert into public.core_log (user_id, delta, reason) values (me, give, earn_cores.reason);
  return give;
end $$;

revoke execute on function public.earn_cores from public, anon;

grant execute on function public.earn_cores to authenticated;

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
