-- Reporting a pilot from the boards (tap a row, then "report" on their card).
--
-- reports keeps each report: who sent it, about whom, why ('name' for an
-- offensive name, 'score' for an impossible score, 'other'), and the name they
-- had then. One report per reporter per pilot per week, 20 a day per reporter.
-- Nobody reads the table but the dashboard (docs/server.md has the snippets).
--
-- Three different pilots reporting a name since it was last set takes it off
-- the boards: it goes back to a generated "pilot-xxxx", which the game asks to
-- change. Scores are never hidden on their own; that's for a person to judge.

create table if not exists public.reports (
  id bigserial primary key,
  reporter uuid not null references auth.users on delete cascade,
  target uuid not null references auth.users on delete cascade,
  reason text not null check (reason in ('name', 'score', 'other')),
  name text not null,
  week date not null,
  at timestamptz not null default now()
);
create unique index if not exists reports_once_a_week on public.reports (reporter, target, week);
create index if not exists reports_by_target on public.reports (target, reason, at desc);

alter table public.reports enable row level security; -- no policies: written by report_pilot, read in the dashboard
revoke all on public.reports from anon, authenticated;

-- When a name was last reset by reports (its reports before then are done with).
alter table public.players add column if not exists name_reset_at timestamptz;

create or replace function public.report_pilot(p_pid uuid, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare
  c_hide_after constant integer := 3; -- different pilots reporting a name
  c_per_day constant integer := 20;
  me uuid := auth.uid();
  who uuid;
  their_name text;
  since timestamptz;
  n integer;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if p_reason is null or p_reason not in ('name', 'score', 'other') then
    raise exception 'pick a reason' using errcode = '22023';
  end if;
  select pl.user_id, pl.name, greatest(pl.name_changed_at, pl.name_reset_at) into who, their_name, since
    from public.players pl where pl.public_id = p_pid and not pl.hidden;
  if who is null then raise exception 'no such pilot' using errcode = '22023'; end if;
  if who = me then raise exception 'that''s you' using errcode = '22023'; end if;
  if (select count(*) from public.reports r where r.reporter = me and r.at > now() - interval '1 day') >= c_per_day then
    raise exception 'too many reports today' using errcode = '22023';
  end if;
  insert into public.reports (reporter, target, reason, name, week)
  values (me, who, p_reason, their_name, (date_trunc('week', now() at time zone 'utc'))::date)
  on conflict (reporter, target, week) do nothing;
  if not found then return 'already'; end if;

  if p_reason = 'name' then
    select count(distinct r.reporter) into n from public.reports r
      where r.target = who and r.reason = 'name' and (since is null or r.at > since);
    if n >= c_hide_after then
      update public.players
        set name = 'pilot-' || substr(md5(random()::text), 1, 4), name_reset_at = now()
        where user_id = who;
    end if;
  end if;
  return 'reported';
end $$;

revoke execute on function public.report_pilot(uuid, text) from public, anon;
grant execute on function public.report_pilot(uuid, text) to authenticated;
