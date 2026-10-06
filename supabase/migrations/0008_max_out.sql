-- Max out a player from the SQL editor (for testing):
--   update public.players set max_out = true where name = 'Ace Pilot';
-- The next time they open the game (or come back to it) it gives them the top
-- rank and league, every look, every upgrade at its top tier and 100,000
-- credits, then clears the flag. Set it again to do it again.

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
