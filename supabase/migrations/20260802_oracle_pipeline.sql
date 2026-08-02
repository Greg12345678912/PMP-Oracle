-- ─── player_stats ────────────────────────────────────────────────────────────
-- Weekly per-player PPR points from Sleeper. Cumulative aggregation happens in JS.
create table if not exists public.player_stats (
  id              uuid primary key default gen_random_uuid(),
  season_id       uuid not null references public.seasons(id),
  week            int not null,
  player_id       text not null,
  player_name     text not null,
  position        text not null,
  team            text,
  game_id         text,            -- Sleeper game identifier (informational, no FK)
  provider        text not null default 'sleeper',
  external_id     text not null,   -- same as player_id for Sleeper
  ppr_points      numeric not null default 0,
  last_synced_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (season_id, week, player_id)
);

alter table public.player_stats enable row level security;
create policy "Admins can manage player stats" on public.player_stats for all using (
  exists (select 1 from public.user_profiles where user_id = auth.uid() and is_admin = true)
);
create policy "Anyone can read player stats" on public.player_stats for select using (true);

-- ─── oracle_entries ──────────────────────────────────────────────────────────
-- One row per submitted user. entry_number is monotonic identity — never changes.
create table if not exists public.oracle_entries (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  season_id           uuid not null references public.seasons(id),
  entry_number        int generated always as identity,
  entered_at          timestamptz not null default now(),
  submission_metadata jsonb not null default '{}',
  unique (user_id, season_id)
);

alter table public.oracle_entries enable row level security;
create policy "Users can read their own entry" on public.oracle_entries
  for select using (auth.uid() = user_id);
create policy "Admins can read all entries" on public.oracle_entries
  for select using (
    exists (select 1 from public.user_profiles where user_id = auth.uid() and is_admin = true)
  );

-- ─── league_state ────────────────────────────────────────────────────────────
-- Current NFL week sourced from Sleeper. One row per season.
create table if not exists public.league_state (
  id              uuid primary key default gen_random_uuid(),
  season_id       uuid not null references public.seasons(id),
  current_week    int not null default 0,
  nfl_season      text,            -- e.g. '2026'
  nfl_week        int,
  nfl_season_type text,            -- 'pre', 'regular', 'post'
  last_synced_at  timestamptz not null default now(),
  unique (season_id)
);

alter table public.league_state enable row level security;
create policy "Anyone can read league state" on public.league_state for select using (true);
create policy "Admins can manage league state" on public.league_state for all using (
  exists (select 1 from public.user_profiles where user_id = auth.uid() and is_admin = true)
);

-- ─── accuracy_scores additions ───────────────────────────────────────────────
-- Columns referenced by existing recalculate route but missing from schema.
alter table public.accuracy_scores
  add column if not exists prev_rank                int,
  add column if not exists rank_change              int,
  add column if not exists current_week             int not null default 0,
  add column if not exists last_scored_at           timestamptz,
  add column if not exists scoring_algorithm_version text not null default 'v1',
  add column if not exists top10_hits               int not null default 0,
  add column if not exists total_rank_error         int not null default 0;

-- ─── sync_jobs additions ─────────────────────────────────────────────────────
alter table public.sync_jobs
  add column if not exists pipeline_run_id uuid,
  add column if not exists metadata        jsonb;
