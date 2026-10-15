-- Error reports from the game: uncaught errors, and the key failures (sign-in,
-- purchases, ads, the cloud save), so problems on players' phones show up
-- without anyone writing in.
--
-- The game sends a few at a time through log_errors, which only adds rows:
-- nobody can read them back but the dashboard (docs/server.md has the
-- snippets). Each row is the account id, a short message and stack, the app
-- version, platform, device model, the screen it happened on, and when.
-- Nothing personal: the game strips names, emails and tokens before sending.
-- At most 20 a call and 50 a day per player; the rest are dropped.

create table if not exists public.client_errors (
  id bigserial primary key,
  user_id uuid references auth.users on delete cascade,
  message text not null,
  stack text not null default '',
  version text not null default '',
  platform text not null default '',
  device text not null default '',
  screen text not null default '',
  at timestamptz not null, -- when it happened (the phone's clock, kept within the last week)
  received_at timestamptz not null default now()
);
create index if not exists client_errors_recent on public.client_errors (received_at desc);
create index if not exists client_errors_by_user on public.client_errors (user_id, received_at desc);

alter table public.client_errors enable row level security; -- no policies: written by log_errors, read in the dashboard
revoke all on public.client_errors from anon, authenticated;

create or replace function public.log_errors(p_errors jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  c_per_call constant integer := 20;
  c_per_day constant integer := 50;
  me uuid := auth.uid();
  room integer;
  e jsonb;
  kept integer := 0;
  ms double precision;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if jsonb_typeof(p_errors) <> 'array' then raise exception 'not a list' using errcode = '22023'; end if;
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
