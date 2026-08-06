-- Atomic Oracle Challenge submission.
-- Wraps the challenge_rankings update and oracle_entries insert in a single
-- transaction so a partial failure can never leave a user with is_submitted=true
-- but no entry_number (which would assign them MAX_SAFE_INTEGER as tiebreaker).
create or replace function public.submit_oracle_entry(
  p_user_id uuid,
  p_season_id uuid
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_number int;
begin
  update public.challenge_rankings
    set is_submitted = true, updated_at = now()
    where user_id = p_user_id and season_id = p_season_id;

  insert into public.oracle_entries (user_id, season_id, entered_at, submission_metadata)
    values (p_user_id, p_season_id, now(), '{}')
    on conflict (user_id, season_id) do nothing;

  select entry_number into v_entry_number
    from public.oracle_entries
    where user_id = p_user_id and season_id = p_season_id;

  return v_entry_number;
end;
$$;
