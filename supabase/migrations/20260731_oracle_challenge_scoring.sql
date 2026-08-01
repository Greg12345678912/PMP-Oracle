create table if not exists public.ground_truth (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references public.seasons(id),
  position    text not null check (position in ('QB','RB','WR','TE')),
  rank        int not null,
  player_id   text not null,
  player_name text not null,
  ppr_points  numeric,
  source      text not null,
  imported_at timestamptz not null default now(),
  unique (season_id, position, rank)
);

alter table public.ground_truth enable row level security;
create policy "Anyone can read ground truth" on public.ground_truth for select using (true);
create policy "Admins can manage ground truth" on public.ground_truth for all using (
  exists (select 1 from public.user_profiles where user_id = auth.uid() and is_admin = true)
);

create table if not exists public.accuracy_scores (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  season_id           uuid not null references public.seasons(id),
  score_qb            numeric,
  score_rb            numeric,
  score_wr            numeric,
  score_te            numeric,
  score_predictions   numeric,
  overall_score       numeric,
  global_rank         int,
  is_projected        boolean not null default false,
  computed_at         timestamptz not null default now(),
  unique (user_id, season_id)
);

alter table public.accuracy_scores enable row level security;
create policy "Anyone can read accuracy scores" on public.accuracy_scores for select using (true);

create table if not exists public.ranking_score_detail (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  season_id    uuid not null references public.seasons(id),
  position     text not null,
  player_id    text not null,
  player_name  text not null,
  user_rank    int not null,
  actual_rank  int,
  distance     int,
  raw_score    int not null default 0,
  confidence   text not null default 'medium',
  final_score  numeric not null default 0,
  unique (user_id, season_id, position, player_id)
);

alter table public.ranking_score_detail enable row level security;
create policy "Users can read their own detail" on public.ranking_score_detail
  for select using (auth.uid() = user_id);
create policy "Admins can read all detail" on public.ranking_score_detail
  for select using (
    exists (select 1 from public.user_profiles where user_id = auth.uid() and is_admin = true)
  );
