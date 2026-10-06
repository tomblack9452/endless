-- Store purchases from RevenueCat's webhook. Each event is kept once (by its
-- id), so a retried webhook never pays twice.

create table if not exists public.store_events (
  id text primary key,
  user_id uuid references auth.users on delete set null,
  product text not null,
  type text not null,
  at timestamptz not null default now()
);

alter table public.store_events enable row level security;
drop policy if exists "own purchases" on public.store_events;
create policy "own purchases" on public.store_events for select using (auth.uid() = user_id);
