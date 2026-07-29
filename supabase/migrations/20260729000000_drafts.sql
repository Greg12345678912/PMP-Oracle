create table if not exists drafts (
  share_id text primary key,
  state    jsonb not null,
  updated_at timestamptz not null default now()
);
