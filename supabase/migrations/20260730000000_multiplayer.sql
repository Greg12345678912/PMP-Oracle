create table if not exists leagues (
  id          uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  name        text not null,
  host_user_id text not null,
  settings    jsonb not null default '{}',
  status      text not null default 'lobby',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists league_members (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references leagues(id) on delete cascade,
  user_id      text not null,
  display_name text not null,
  team_slot    int,
  is_ready     boolean not null default false,
  joined_at    timestamptz not null default now(),
  unique(league_id, user_id)
);

create table if not exists league_drafts (
  league_id    uuid primary key references leagues(id) on delete cascade,
  version      int not null default 0,
  state        jsonb not null,
  pick_deadline timestamptz,
  updated_at   timestamptz not null default now()
);

create table if not exists draft_events (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references leagues(id) on delete cascade,
  version    int not null,
  type       text not null,
  payload    jsonb not null default '{}',
  user_id    text,
  created_at timestamptz not null default now(),
  unique(league_id, version)
);
