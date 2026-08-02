-- ─── P0-1: Fix pre-lock data leak on challenge_rankings ─────────────────────
-- The old "Authenticated can read public rankings after lock" policy had no
-- lock-date check — any authenticated user with the anon key could read all
-- public rankings at any time, well before the lock date.
-- Replace with a policy that gates on the season's lock_at timestamp.

drop policy if exists "Authenticated can read public rankings after lock" on challenge_rankings;

create policy "Read public rankings after season lock" on challenge_rankings
  for select using (
    -- owners always see their own rows
    auth.uid() = user_id
    or (
      -- non-owners see public rows only after the season has locked
      is_public = true
      and exists (
        select 1 from public.seasons s
        where s.id = season_id
        and (s.status != 'open' or s.lock_at <= now())
      )
    )
  );

-- ─── P0-2: Fix post-lock modification bypass on challenge_rankings ────────────
-- is_locked is never set to true by any application code, so the old update
-- policy "auth.uid() = user_id and is_locked = false" always passed — meaning
-- authenticated users could bypass ORACLE_LOCK_DATE via the anon key and update
-- their picks after the deadline.
-- Replace with a policy that checks the season's lock_at in the DB.

drop policy if exists "Users can update own rankings" on challenge_rankings;

create policy "Users can update own rankings before season lock" on challenge_rankings
  for update using (
    auth.uid() = user_id
    and is_locked = false
    and exists (
      select 1 from public.seasons s
      where s.id = season_id
      and s.status = 'open'
      and s.lock_at > now()
    )
  );

-- ─── P0-2b: Same fix for challenge_predictions ───────────────────────────────
-- The predictions update policy also had no lock-date check.

drop policy if exists "Users can update own predictions" on challenge_predictions;

create policy "Users can update own predictions before season lock" on challenge_predictions
  for update using (
    auth.uid() = user_id
    and exists (
      select 1 from public.seasons s
      where s.id = season_id
      and s.status = 'open'
      and s.lock_at > now()
    )
  );
