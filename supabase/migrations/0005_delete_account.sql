-- Delete your own account from the game (both stores ask for this). The
-- account goes, and with it (on delete cascade) the player, save, wallet,
-- cores log, runs and bests. Purchase records stay, without the account,
-- for the books (store_events.user_id is set to null).

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_my_account from public, anon;
grant execute on function public.delete_my_account to authenticated;
