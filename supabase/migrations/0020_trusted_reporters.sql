-- Name reports only count from pilots who have played (from the 1.0.7 review).
--
-- Three different pilots reporting a name resets it (0017). Anonymous accounts
-- cost nothing, so three fresh ones could reset anyone's name. Now a report
-- only counts towards that if its reporter has flown at least 5 runs on the
-- server, or has had their account at least 3 days. Every report is still
-- kept (the dashboard sees them all); the rest is as 0017 left it.

-- Has this player played enough for their name reports to count?
create or replace function public.trusted_reporter(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from public.players pl
      where pl.user_id = p_user and pl.created_at <= now() - interval '3 days'
    )
    or (select count(*) from (select 1 from public.runs r where r.user_id = p_user limit 5) five) >= 5
$$;

revoke execute on function public.trusted_reporter(uuid) from public, anon, authenticated; -- only report_pilot calls it

create or replace function public.report_pilot(p_pid uuid, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare
  c_hide_after constant integer := 3; -- different pilots, each with 5 runs or 3 days behind them, reporting a name
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
      where r.target = who and r.reason = 'name' and (since is null or r.at > since)
        and public.trusted_reporter(r.reporter);
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
