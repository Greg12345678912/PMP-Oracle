alter table challenge_rankings
  add column if not exists is_submitted boolean not null default false;
