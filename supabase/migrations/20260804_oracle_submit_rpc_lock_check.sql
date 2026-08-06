-- Adds lock enforcement to submit_oracle_entry.
-- The function uses security definer (bypasses RLS), so it must check the
-- lock itself. Without this, any authenticated user can call the RPC directly
-- via the Supabase client after lock_at passes and submit a retroactive entry.
create or replace function public.submit_oracle_entry(
  p_user_id uuid,
  p_season_id uuid
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock_at  timestamptz;
  v_status   text;
  v_entry_number int;
begin
  select lock_at, status
    into v_lock_at, v_status
    from public.seasons
    where id = p_season_id;

  if v_status is null then
    raise exception 'Season not found';
  end if;

  if v_status != 'open' or v_lock_at <= now() then
    raise exception 'Season is locked';
  end if;

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
