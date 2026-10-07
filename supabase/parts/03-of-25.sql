-- Endless Space database: part 3 of 25. Run the parts in order, 01 first.

-- Leaderboards: one table of each player's best per board, filled by submit_run
-- (which checks a run is possible) and read through leaderboard().
--
-- Boards:
--   ranked          the week's run, one board per week and league
--   endless         every area in turn, all time
--   solo:<env>      one environment endlessly, all time (open-ground, canyon,
--                   ship, ice, asteroids, volcanic)
--
-- Everything is plain SQL: there is no function to deploy.

-- Pilot names: shown on the boards. hidden takes a player off them.
alter table public.players add column if not exists hidden boolean not null default false;

alter table public.players add column if not exists name_changed_at timestamptz;

-- Every submitted run, kept for checking and clean-up. Written only by submit_run.
alter table public.runs add column if not exists board text not null default 'ranked';

create index if not exists runs_by_user on public.runs (user_id, at desc);

-- The best run per player on each board (period is the week's Monday for
-- ranked, 'all' for the rest; league is 0 outside ranked).
create table if not exists public.bests (
  board text not null,
  period text not null,
  league smallint not null default 0,
  user_id uuid not null references auth.users on delete cascade,
  score integer not null,
  seconds real not null,
  achieved_at timestamptz not null default now(),
  primary key (board, period, league, user_id)
);

create index if not exists bests_top on public.bests (board, period, league, score desc, achieved_at);

alter table public.bests enable row level security;

-- no policies: read through leaderboard()

-- Carry over what the old board view showed.
insert into public.bests (board, period, league, user_id, score, seconds, achieved_at)
select distinct on (week, league, user_id) 'ranked', week::text, league, user_id, score, seconds, at
from public.runs
order by week, league, user_id, score desc, at
on conflict do nothing;

drop view if exists public.board;
