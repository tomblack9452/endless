-- Function hygiene (the 1.0.11 audit): nothing changes for the game.
--
-- on_new_user() is the trigger that gives a new account its player row and
-- wallet. Like every function it could be called by anyone through the API
-- (a trigger function refuses a direct call, so it did nothing), and Supabase's
-- linter flags it: now only the trigger runs it.
--
-- The functions that aren't security definer had no search_path of their own
-- (Supabase's linter: "function search path mutable"). They only use public
-- and pg_catalog, so they're pinned to that now, as the definer ones are.

revoke execute on function public.on_new_user() from public, anon, authenticated;

alter function public.daily_period(timestamptz) set search_path = public;
alter function public.pass_season(timestamptz) set search_path = public;
alter function public.server_now() set search_path = public;
alter function public.check_run(text, smallint, integer, real, real, real[]) set search_path = public;
