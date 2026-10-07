-- Endless Space database: part 10 of 23. Run the parts in order, 01 first.

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

-- Max out a player from the SQL editor (for testing):
--   update public.players set max_out = true where name = 'Ace Pilot';
-- The next time they open the game (or come back to it) it gives them the top
-- rank and league, every look, every upgrade at its top tier, every level and
-- 100,000 credits, then clears the flag. Set it again to do it again.

alter table public.players add column if not exists max_out boolean not null default false;

-- Take the flag (true once, then it's cleared).
create or replace function public.take_max_out() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  was boolean;
begin
  update public.players set max_out = false
  where user_id = auth.uid() and max_out
  returning true into was;
  return coalesce(was, false);
end;
$$;

revoke execute on function public.take_max_out from public, anon;

grant execute on function public.take_max_out to authenticated;

-- No profanity in pilot names. The words are from
-- https://github.com/zautumnz/profane-words (WTFPL), made by
-- `npm run names:build` (scripts/name-filter/). The rules match
-- src/nameFilter.ts, which checks the same in the game first:
--   a name is split into words (at spaces, - and _, and between a small and a
--   capital letter), each read with leetspeak undone and with digits dropped;
--   it's refused if a word, or the whole name run together, is on the list, or
--   if it contains a strong root anywhere.
-- To find names picked before this:  select name from players where name_blocked(name);

create table if not exists public.name_words (
  word text primary key,
  strong boolean not null default false -- refused anywhere in a name, not just as a word
);

alter table public.name_words enable row level security;

-- only the functions below read it
revoke all on public.name_words from anon, authenticated;
