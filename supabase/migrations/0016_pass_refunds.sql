-- A refunded season pass takes back what it gave (the open item from the
-- second audit).
--
-- How the premium track was unlocked is on the server's records already:
--   money   a 'season_pass' row in store_events (the purchase webhook)
--   cores   the game spends the cores with the reason 'pass-premium:<season>'
-- store_refund, for a season pass bought with money, now also takes back the
-- cores its premium tiers paid that season (the 'pass:<season>:p<tier>' rows in
-- core_log), as one 'refund:pass:<season>' row; the balance can't go below
-- zero. A pass unlocked with cores is never touched.
-- earn_cores then pays no premium tier for a season whose pass was refunded,
-- unless it was bought again or unlocked with cores. The game drops the
-- premium track when it reads the refunded row (restorePass in game.ts).
-- Every other rule in both is as 0011 and 0014 left them.

-- The pass season a moment falls in: six-week seasons from 14 September 2026 (src/progression/season.ts).
create or replace function public.pass_season(p_at timestamptz) returns integer
language sql immutable as $$
  select (floor(((p_at at time zone 'utc')::date - date '2026-09-14') / 42) + 1)::integer
$$;

-- True if the player's season pass for `p_season` was refunded and nothing unlocks it now.
create or replace function public.pass_refunded(p_user uuid, p_season integer) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from public.store_events e
      where e.user_id = p_user and e.product = 'refunded:season_pass' and public.pass_season(e.at) = p_season
    )
    and not exists (
      select 1 from public.store_events e
      where e.user_id = p_user and e.product = 'season_pass' and public.pass_season(e.at) = p_season
    )
    and not exists (
      select 1 from public.core_log l where l.user_id = p_user and l.reason = 'pass-premium:' || p_season and l.delta < 0
    )
$$;

revoke execute on function public.pass_refunded(uuid, integer) from public, anon, authenticated; -- only the functions here call it

create or replace function public.store_refund(p_id text, p_user uuid, p_product text, p_transaction text, p_cores integer)
returns text language plpgsql security definer set search_path = public as $$
declare
  bought text;
  bought_at timestamptz;
  season integer;
  paid integer;
begin
  insert into public.store_events (id, user_id, product, type, transaction_id)
  values (p_id, p_user, 'refund:' || p_product, 'CANCELLATION', p_transaction)
  on conflict (id) do nothing;
  if not found then return 'duplicate'; end if;
  select e.id, e.at into bought, bought_at from public.store_events e
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
  -- A season pass bought with money: its premium tiers' cores go back too.
  if p_product = 'season_pass' and p_user is not null then
    season := public.pass_season(bought_at);
    if public.pass_refunded(p_user, season) then
      -- Once per season: a second refund finds the first one's row.
      if not exists (select 1 from public.core_log l where l.user_id = p_user and l.reason = 'refund:pass:' || season) then
        select coalesce(sum(l.delta), 0) into paid from public.core_log l
          where l.user_id = p_user and l.reason ~ ('^pass:' || season || ':p[0-9]+$');
        if paid > 0 then
          update public.wallets set cores = greatest(0, cores - paid) where user_id = p_user;
          insert into public.core_log (user_id, delta, reason) values (p_user, -paid, 'refund:pass:' || season);
        end if;
      end if;
    end if;
  end if;
  return 'refunded';
end $$;

revoke execute on function public.store_refund from public, anon, authenticated;
grant execute on function public.store_refund to service_role;

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
    -- A refunded pass pays no more premium tiers.
    if rest ~ ':p' and public.pass_refunded(me, season) then return 0; end if;
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
