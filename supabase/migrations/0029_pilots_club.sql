-- The pilot's club (1.0.15): a monthly subscription. The webhook keeps when
-- each member's subscription runs until (club_members, from RevenueCat's
-- expiration_at_ms), and earn_cores pays the club's daily cores
-- ('club:<date>', today's, once a day, 10 at most) only while it runs.
-- A purchase, renewal or uncancellation moves `until` later; a cancellation
-- (auto-renew off, or a refund) or an expiry can only bring it nearer, so an
-- event arriving late can't end a membership early or lengthen it.
-- Every other rule in earn_cores is as 0027 left it.

create table if not exists public.club_members (
  user_id uuid primary key references auth.users on delete cascade,
  until timestamptz not null,
  updated_at timestamptz not null default now()
);
-- Written by the webhook only: no access for the game's keys.
alter table public.club_members enable row level security;
revoke all on public.club_members from anon, authenticated;

create or replace function public.store_club(p_id text, p_user uuid, p_product text, p_type text, p_until timestamptz)
returns text language plpgsql security definer set search_path = public as $$
begin
  insert into public.store_events (id, user_id, product, type, at) values (p_id, p_user, p_product, p_type, now())
  on conflict (id) do nothing;
  if not found then return 'duplicate'; end if;
  if p_user is null or p_until is null then return 'kept'; end if;
  insert into public.club_members (user_id, until) values (p_user, p_until)
  on conflict (user_id) do update set
    until = case when p_type in ('CANCELLATION', 'EXPIRATION') then least(public.club_members.until, excluded.until)
                 else greatest(public.club_members.until, excluded.until) end,
    updated_at = now();
  return 'kept';
end $$;

revoke execute on function public.store_club(text, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.store_club(text, uuid, text, text, timestamptz) to service_role;

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

  if kind in ('login', 'gift', 'goals', 'weekly', 'daily', 'adcores', 'club') then
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
    -- daily: the challenge streak's cores (CONFIG.daily.streak); adcores: the store's free cores for an
    -- ad (CONFIG.ads.freeCores). tests/sql.test.ts checks both.
    -- club: the pilot's club's daily cores (CONFIG.economy.store.club), only while the subscription runs.
    if kind = 'club' and not exists (select 1 from public.club_members c where c.user_id = me and c.until > now()) then return 0; end if;
    most := case kind when 'login' then 15 when 'gift' then 2 when 'goals' then 4 when 'daily' then 3 when 'adcores' then 5 when 'club' then 10 else 15 end;
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
