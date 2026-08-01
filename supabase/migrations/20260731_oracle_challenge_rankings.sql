-- challenge_rankings: one row per (user, season, position), rankings stored as ordered jsonb array
create table if not exists challenge_rankings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  season_id     uuid not null references seasons(id) on delete cascade,
  position      text not null check (position in ('QB','RB','WR','TE')),
  rankings      jsonb not null default '[]',
  is_locked     boolean not null default false,
  is_public     boolean not null default true,
  locked_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, season_id, position)
);

-- RLS
alter table challenge_rankings enable row level security;

create policy "Users can read own rankings" on challenge_rankings
  for select using (auth.uid() = user_id);

create policy "Authenticated can read public rankings after lock" on challenge_rankings
  for select using (is_public = true);

create policy "Users can insert own rankings" on challenge_rankings
  for insert with check (auth.uid() = user_id);

create policy "Users can update own rankings" on challenge_rankings
  for update using (auth.uid() = user_id and is_locked = false);
