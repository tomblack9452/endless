-- A cores spend is taken once (1.0.12).
--
-- The game sends a spend again when it heard no answer (no signal). If the
-- server had taken it and only the answer was lost, the second send charged
-- again. Now each spend carries an id the game makes once: a spend whose id is
-- already in the log is answered "taken" and charges nothing.
--
-- A new function, so spend_cores stays exactly as it was for older versions of
-- the game (which send no id), and the two never share a name: setup.sql runs
-- again over a database it made, and a second spend_cores would make the
-- earlier migrations' grants ambiguous.

alter table public.core_log add column if not exists spend_id text;
create unique index if not exists core_log_spend_once on public.core_log (user_id, spend_id) where spend_id is not null;

create or replace function public.spend_cores_once(amount integer, reason text, spend_id text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null or amount is null or amount <= 0 or spend_id is null or length(spend_id) > 64 then return false; end if;
  -- Sent again after a lost answer: it was taken the first time.
  if exists (select 1 from public.core_log l where l.user_id = me and l.spend_id = spend_cores_once.spend_id) then return true; end if;
  update public.wallets set cores = cores - amount where user_id = me and cores >= amount;
  if not found then return false; end if;
  insert into public.core_log (user_id, delta, reason, spend_id) values (me, -amount, reason, spend_cores_once.spend_id);
  return true;
end $$;

revoke execute on function public.spend_cores_once(integer, text, text) from public, anon;
grant execute on function public.spend_cores_once(integer, text, text) to authenticated;
