create table if not exists challenge_predictions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  season_id    uuid not null references seasons(id) on delete cascade,
  question_id  text not null check (question_id in ('nfl_mvp','oroy','cpoy','rb1','wr1','te1','bust','breakout')),
  answer       text not null check (char_length(answer) between 1 and 100),
  is_correct   boolean,           -- null until admin scores
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, season_id, question_id)
);

alter table challenge_predictions enable row level security;

create policy "Users can read own predictions" on challenge_predictions
  for select using (auth.uid() = user_id);

create policy "Public predictions visible after lock" on challenge_predictions
  for select using (is_correct is not null);   -- only visible once admin has scored

create policy "Users can insert own predictions" on challenge_predictions
  for insert with check (auth.uid() = user_id);

create policy "Users can update own predictions" on challenge_predictions
  for update using (auth.uid() = user_id);

create policy "Admins can update is_correct" on challenge_predictions
  for update using (
    exists (select 1 from user_profiles where user_id = auth.uid() and is_admin = true)
  );
