-- Endless Space database: part 26 of 28. Run the parts in order, 01 first.

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
  if not found then return 0; end if;
  insert into public.core_log (user_id, delta, reason) values (me, give, earn_cores.reason);
  return give;
end $$;

-- As 0010 and 0011 left them: players earn and spend, only the webhook grants.
revoke execute on function public.earn_cores from public, anon;

grant execute on function public.earn_cores to authenticated;

revoke execute on function public.grant_cores from public, anon, authenticated;

grant execute on function public.grant_cores to service_role;

-- Service records on the boards: tap a pilot to see their rank and stats.
--
-- Each player sends a small summary of their own service record (rank, xp,
-- lifetime stats) with set_record, kept on their players row. The boards hand
-- out a public id per pilot (never the account id), and pilot_record() reads a
-- pilot's card by it: name, premium, ship, that summary, and their bests.

alter table public.players add column if not exists public_id uuid not null default gen_random_uuid();

create unique index if not exists players_public_id on public.players (public_id);

alter table public.players add column if not exists record jsonb;
