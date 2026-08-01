# Task 2 Report: Supabase — enable Google OAuth + create tables

## Status: DONE

## Commit

- `e85cffb` — feat: add user_profiles + seasons tables, seed 2026 season, oracle constants

---

## Files Created / Modified

### `supabase/migrations/20260731_oracle_challenge_foundation.sql` (created)

Local migration file matching the SQL applied to production. Creates:
- `user_profiles` table with RLS (3 policies: read-all, self-update, self-insert)
- `seasons` table with RLS (2 policies: read-all, admin-manage)
- Seeds 2026 season row (`lock_at = '2026-09-09T20:20:00-04:00'`, `status = 'open'`)

### `lib/oracle/constants.ts` (created)

Exports:
- `ORACLE_LOCK_DATE = new Date('2026-09-09T20:20:00-04:00')`
- `ORACLE_POSITIONS` (`['QB', 'RB', 'WR', 'TE'] as const`)
- `OraclePosition` type
- `POSITION_LIST_SIZE` record (`QB: 10, RB: 20, WR: 20, TE: 10`)

---

## SQL Migration Applied (full text)

```sql
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
```

Applied via `mcp__claude_ai_Supabase__apply_migration` to project `lhqrkkhscdvpqidhjwcr` (pretty-much-picks, us-east-1).

---

## Table Verification

```sql
select table_name from information_schema.tables
where table_schema = 'public'
and table_name in ('user_profiles', 'seasons');
```

Result: **2 rows** — `seasons`, `user_profiles`. Both confirmed present.

---

## Build Command + Result

```
npm run build
```

Result: **PASS**

```
▲ Next.js 16.2.11 (Turbopack)
✓ Compiled successfully in 1838ms
  Running TypeScript ...
  Finished TypeScript in 2.5s ...
✓ Generating static pages using 10 workers (13/13) in 2.1s

ƒ Proxy (Middleware)
```

TypeScript: 0 errors. 13 pages generated. No new warnings introduced.

Pre-existing non-fatal warnings (unrelated to this task):
- `Failed to set Next.js data cache for https://api.sleeper.app/v1/players/nfl, items over 2MB can not be cached` — pre-existing Sleeper API cache size issue.
- Workspace root lockfile detection warning — pre-existing.

---

## Self-Review Notes

- `oracle_rankings` table (with `is_public boolean not null default true`) is **not** in this migration per the brief — Task 2 only covers `user_profiles` and `seasons`. The `oracle_rankings` table is expected in a later task.
- `ORACLE_LOCK_DATE` is defined once in `lib/oracle/constants.ts` and matches the seeded `lock_at` in the `seasons` row exactly (`2026-09-09T20:20:00-04:00`). Downstream tasks must import from this single source.
- Google OAuth enablement is a dashboard action (Authentication → Providers → Google) — no code change required. No new env vars needed beyond the already-present `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- The `seasons` table uses a `check` constraint (`status in ('open','locked','scoring','scored')`) but immutability after lock is deferred to the API layer in Task 6 per the global constraints.
- RLS on `user_profiles`: the admin-manage policy on `seasons` references `user_profiles` in a subquery — this is safe because `user_profiles` has a permissive read policy, so the subquery will resolve correctly for any authenticated user.
