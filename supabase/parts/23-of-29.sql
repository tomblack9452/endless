-- Endless Space database: part 23 of 29. Run the parts in order, 01 first.

-- END WORDS

create or replace function public.name_blocked(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  with raw as (
    select w, i
    from unnest(regexp_split_to_array(lower(regexp_replace(coalesce(p_name, ''), '([a-z])([A-Z])', '\1 \2', 'g')), '[ _-]+'))
      with ordinality as t(w, i)
    where w <> ''
  ), forms as (
    select i, regexp_replace(translate(w, '0134578', 'oieastb'), '[^a-z]', '', 'g') as leet,
              regexp_replace(w, '[^a-z]', '', 'g') as plain
    from raw
  ), whole as (
    select string_agg(leet, '' order by i) as c from forms
    union all
    select string_agg(plain, '' order by i) from forms
  )
  select exists (select 1 from public.name_words n where n.word in (select leet from forms union select plain from forms))
      or exists (select 1 from public.name_words n, whole where n.word = whole.c or (n.strong and position(n.word in whole.c) > 0));
$$;

revoke execute on function public.name_blocked from public, anon, authenticated;

-- set_pilot_name, as before (0003), and now refusing blocked names.
create or replace function public.set_pilot_name(p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  clean text := btrim(coalesce(p_name, ''));
  changed timestamptz;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if clean !~ '^[A-Za-z0-9_ -]{3,16}$' then
    raise exception 'use 3 to 16 letters, numbers, spaces, - or _' using errcode = '22023';
  end if;
  if public.name_blocked(clean) then
    raise exception 'that name isn''t allowed. try another' using errcode = '22023';
  end if;
  if exists (select 1 from public.players where lower(name) = lower(clean) and user_id <> me) then
    raise exception 'that name is taken' using errcode = '22023';
  end if;
  select name_changed_at into changed from public.players where user_id = me;
  if changed is not null and now() - changed < interval '1 hour' then
    raise exception 'you can change your name once an hour' using errcode = '22023';
  end if;
  update public.players set name = clean, name_changed_at = now() where user_id = me;
  return clean;
end $$;

revoke execute on function public.set_pilot_name from public, anon;

grant execute on function public.set_pilot_name to authenticated;

-- Cores can only come from real rewards (assessment items 1 and 2).
--
-- 1. grant_cores pays any account any amount, for the purchase webhook (which
--    uses the service key). 0001 revoked it from anon and authenticated, but
--    Postgres gives every function to PUBLIC too, so players could still call
--    it. Revoke that as well.
-- 2. earn_cores trusted the client up to 120 a day. Now every reward names
--    itself ("login:2026-10-07", "pass:3:p10", "set:forge"...), is paid at most
--    once, at most its real size, and only for the current day, week or season.

revoke execute on function public.grant_cores from public, anon, authenticated;

revoke execute on function public.earn_cores, public.spend_cores from public, anon;

grant execute on function public.earn_cores, public.spend_cores to authenticated;

create index if not exists core_log_reason on public.core_log (user_id, reason);
