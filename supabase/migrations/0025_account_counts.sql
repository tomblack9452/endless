-- How many pilots there are, for the analytics notes (docs/analytics.md):
-- totals only, never who. Firebase counts devices; this counts accounts,
-- including the ones that never agreed to usage stats.
--
-- For the service role only (the dashboard's SQL editor, or a script with the
-- service key): players can't call it.

create or replace function public.account_counts()
returns table (accounts bigint, anonymous bigint, google bigint, new_7d bigint, new_30d bigint, active_7d bigint, active_30d bigint)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from auth.users),
    (select count(*) from auth.users u where coalesce(u.is_anonymous, false)),
    (select count(*) from auth.users u where not coalesce(u.is_anonymous, false)),
    (select count(*) from auth.users u where u.created_at > now() - interval '7 days'),
    (select count(*) from auth.users u where u.created_at > now() - interval '30 days'),
    (select count(distinct r.user_id) from public.runs r where r.at > now() - interval '7 days'),
    (select count(distinct r.user_id) from public.runs r where r.at > now() - interval '30 days')
$$;

revoke execute on function public.account_counts() from public, anon, authenticated;
grant execute on function public.account_counts() to service_role;
