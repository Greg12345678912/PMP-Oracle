-- user_profiles: linked to Supabase auth
create table if not exists public.user_profiles (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid unique not null references auth.users(id) on delete cascade,
  username       text unique not null,        -- immutable @handle, used in /u/[username]
  display_name   text not null,
  avatar_url     text,
  is_verified    boolean not null default false,
  is_creator     boolean not null default false,
  is_admin       boolean not null default false,
  creator_links  jsonb not null default '{}', -- { youtube, tiktok, podcast, newsletter }
  accuracy_rating int not null default 1000,  -- stored now, surfaced post-Season-1
  created_at     timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "Users can read all profiles"
  on public.user_profiles for select using (true);

create policy "Users can update their own profile"
  on public.user_profiles for update using (auth.uid() = user_id);

create policy "Users can insert their own profile"
  on public.user_profiles for insert with check (auth.uid() = user_id);

-- seasons: one row per NFL season
create table if not exists public.seasons (
  id         uuid primary key default gen_random_uuid(),
  year       int unique not null,
  name       text not null,           -- "2026 Oracle Challenge"
  lock_at    timestamptz not null,    -- rankings/predictions lock at this timestamp
  scored_at  timestamptz,             -- null until admin triggers scoring
  status     text not null default 'open'
               check (status in ('open','locked','scoring','scored'))
);

alter table public.seasons enable row level security;

create policy "Anyone can read seasons"
  on public.seasons for select using (true);

create policy "Admins can manage seasons"
  on public.seasons for all using (
    exists (
      select 1 from public.user_profiles
      where user_id = auth.uid() and is_admin = true
    )
  );

-- Seed 2026 season
insert into public.seasons (year, name, lock_at, status)
values (
  2026,
  '2026 Oracle Challenge',
  '2026-09-09T20:20:00-04:00',
  'open'
) on conflict (year) do nothing;
