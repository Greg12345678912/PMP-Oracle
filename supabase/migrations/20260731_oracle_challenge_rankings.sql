create table if not exists public.challenge_rankings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  season_id    uuid not null references public.seasons(id),
  position     text not null check (position in ('QB','RB','WR','TE')),
  player_rank  int not null check (player_rank >= 1),
  player_id    text not null,
  player_name  text not null,
  confidence   text not null default 'medium'
                 check (confidence in ('low','medium','high')),
  submitted_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, season_id, position, player_rank)
);

alter table public.challenge_rankings enable row level security;

create policy "Users can read all rankings after lock"
  on public.challenge_rankings for select using (true);

create policy "Users can manage their own rankings"
  on public.challenge_rankings for all using (auth.uid() = user_id);

-- Draft rankings: allow unauthenticated users to save via API (server-side writes use service role)
