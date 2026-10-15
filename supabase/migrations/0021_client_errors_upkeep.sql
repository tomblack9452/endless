-- Error reports look after themselves (from the 1.0.7 review): the table stays
-- small with nobody clearing it by hand.
--
-- log_errors (0018) now also deletes the calling player's reports older than
-- 60 days, and on each call prunes a few of anyone's that are older than that
-- (oldest first, 50 at most, by the received_at index), so players who have
-- stopped playing are cleared too. Every other rule is as 0018 left it.

-- Delete up to `p_limit` error reports older than 60 days, oldest first; how many went.
create or replace function public.prune_client_errors(p_limit integer default 50) returns integer
language plpgsql security definer set search_path = public as $$
declare
  c_keep constant interval := interval '60 days';
  gone integer;
begin
  delete from public.client_errors where id in (
    select e.id from public.client_errors e
    where e.received_at < now() - c_keep
    order by e.received_at
    limit greatest(0, least(coalesce(p_limit, 50), 500))
  );
  get diagnostics gone = row_count;
  return gone;
end $$;

revoke execute on function public.prune_client_errors(integer) from public, anon, authenticated; -- log_errors calls it (and the SQL editor can)

create or replace function public.log_errors(p_errors jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  c_per_call constant integer := 20;
  c_per_day constant integer := 50;
  c_keep constant interval := interval '60 days';
  me uuid := auth.uid();
  room integer;
  e jsonb;
  kept integer := 0;
  ms double precision;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if jsonb_typeof(p_errors) <> 'array' then raise exception 'not a list' using errcode = '22023'; end if;
  -- Upkeep: this player's old reports, and a few of anyone's.
  delete from public.client_errors where user_id = me and received_at < now() - c_keep;
  perform public.prune_client_errors(50);
  select c_per_day - count(*) into room from public.client_errors
    where user_id = me and received_at > now() - interval '1 day';
  for e in select value from jsonb_array_elements(p_errors) limit least(c_per_call, greatest(room, 0)) loop
    if jsonb_typeof(e) <> 'object' or coalesce(e->>'message', '') = '' then continue; end if;
    ms := case when jsonb_typeof(e->'at') = 'number' then (e->>'at')::double precision else null end;
    insert into public.client_errors (user_id, message, stack, version, platform, device, screen, at)
    values (
      me,
      left(e->>'message', 300),
      left(coalesce(e->>'stack', ''), 1000),
      left(coalesce(e->>'version', ''), 40),
      left(coalesce(e->>'platform', ''), 20),
      left(coalesce(e->>'device', ''), 80),
      left(coalesce(e->>'screen', ''), 40),
      case when ms is null then now() else least(now(), greatest(now() - interval '7 days', to_timestamp(ms / 1000))) end
    );
    kept := kept + 1;
  end loop;
  return kept;
end $$;

revoke execute on function public.log_errors(jsonb) from public, anon;
grant execute on function public.log_errors(jsonb) to authenticated;
