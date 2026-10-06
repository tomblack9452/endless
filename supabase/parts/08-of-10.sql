-- Endless Space database: part 8 of 10. Run the parts in order, 01 first.

-- Set your own. Only the shape is checked (known slots, short ids, small
-- numbers): which looks a player owns lives on their device.
create or replace function public.set_ship(p_ship jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  k text;
  v jsonb;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if jsonb_typeof(p_ship) <> 'object' or octet_length(p_ship::text) > 400 then
    raise exception 'not a ship' using errcode = '22023';
  end if;
  for k, v in select * from jsonb_each(p_ship) loop
    if k in ('hull', 'paint', 'markings', 'fins', 'decal', 'engine', 'trail') then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^[a-z0-9-]{1,24}$' then
        raise exception 'not a look: %', k using errcode = '22023';
      end if;
    elsif k in ('rank', 'league', 'division') then
      if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric not between 0 and 99 then
        raise exception 'not a number: %', k using errcode = '22023';
      end if;
    else
      raise exception 'not a slot: %', k using errcode = '22023';
    end if;
  end loop;
  update public.players set ship = p_ship where user_id = auth.uid();
end;
$$;

revoke execute on function public.set_ship from public, anon;

grant execute on function public.set_ship to authenticated;

-- leaderboard() gains a ship column, so it's made again (a function's
-- columns can't change in place).
drop function if exists public.leaderboard(text, text, smallint, integer);
