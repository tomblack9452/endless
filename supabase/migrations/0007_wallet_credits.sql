-- Credits on the server too, next to cores, so a balance can be changed from
-- the dashboard (Table Editor > wallets > credits). Credits are still earned
-- and spent on the device; sync_credits merges the two: whatever changed on
-- the server since the device last synced is added to the device's balance.

alter table public.wallets add column if not exists credits bigint check (credits >= 0);

-- p_credits: the device's balance now. p_last: what the server said last time
-- (null if this device has never synced). Returns the balance to keep.
create or replace function public.sync_credits(p_credits bigint, p_last bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  have bigint;
  keep bigint;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if p_credits is null or p_credits < 0 or p_credits > 1000000000 then
    raise exception 'not a balance' using errcode = '22023';
  end if;
  select credits into have from public.wallets where user_id = auth.uid() for update;
  if not found then
    return p_credits;
  end if;
  if have is null then
    keep := p_credits; -- the first sync: the device's balance
  elsif p_last is null then
    keep := have; -- a device that has never synced: the server's
  else
    keep := greatest(0, p_credits + (have - p_last)); -- the device's, plus any change made on the server
  end if;
  update public.wallets set credits = keep where user_id = auth.uid();
  return keep;
end;
$$;

revoke execute on function public.sync_credits from public, anon;
grant execute on function public.sync_credits to authenticated;
