alter table user_profiles
  add column if not exists is_public boolean not null default true;
