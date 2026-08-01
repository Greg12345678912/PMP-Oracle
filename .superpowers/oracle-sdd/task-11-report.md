# Task 11 Report — Public Profiles `/u/[username]`

**Status:** DONE
**Commit:** `9a88c5c`
**Branch:** `feature/multiplayer-m1`
**Build:** PASS (Next.js 16.2.11, Turbopack, TypeScript clean)

---

## Files Created

- `app/u/[username]/page.tsx` — Server component, `force-dynamic`
- `app/u/[username]/client.tsx` — Client component (`'use client'`), handles position tab switching

---

## What Was Built

### page.tsx (server)
- Fetches `user_profiles` by `username` via service client
- Calls `notFound()` (from `next/navigation`) if row missing **or** `is_public = false`
- Checks `new Date() >= ORACLE_LOCK_DATE` for visibility gating
- Fetches in parallel (when appropriate):
  - `accuracy_scores` — only if `season.status === 'scored'`
  - `ranking_score_detail` — only if scored
  - `challenge_rankings` — after lock date (raw picks for preview)
  - `accuracy_scores` count for percentile
  - `challenge_predictions` via `getPredictions()` — after lock date
- Builds `PositionResult[]` and `OracleResult` from detail rows
- Calls `generateSummary()` if scored
- Extracts top-3 picks per position from raw rankings JSONB
- Passes all serializable data to `ProfileClient`

### client.tsx (client)
- Profile header: avatar (img or initials fallback), display_name, @username
- Badges: "✓ Verified" and "Creator" rendered conditionally on `is_verified`/`is_creator`
- "Edit my challenge" link shown only when `isOwn === true`
- Oracle score hero (72px font) + "Top X%" — only if `isScored && overallScore !== null`
- Position breakdown bar chart (4 bars, `bg-pmp-red`) — only if scored
- Season summary italic quote — only if scored
- Rankings section:
  - Before lock: "Rankings hidden until September 9" placeholder
  - After lock: tab strip (QB/RB/WR/TE) with active tab showing top 3 picks + confidence dot
- Predictions grid (2 columns) with ✅/❌/⏳ — hidden before lock date

---

## Constraints Verified

| Rule | Status |
|------|--------|
| `is_public = false` → `notFound()` | Done — checked before any other fetch |
| No raw `text-white` | Done — all uses are `text-pmp-white` |
| `h-[100dvh]` not `h-screen` | Done — `min-h-[100dvh]` used |
| Rankings hidden before lock | Done — `isAfterLock` gate |
| Predictions hidden before lock | Done — same gate |
| `force-dynamic` | Done |
| `notFound()` from `next/navigation` per docs | Done |
| Server component | Done — page.tsx has no `'use client'` |

---

## Build Output

```
✓ Compiled successfully in 1807ms
✓ TypeScript: Finished in 2.4s (no errors in app/u/)
✓ /u/[username] — ƒ (Dynamic) server-rendered on demand
```

Pre-existing test file TS errors (test runner globals, stale test fixtures) were present before this task and are unrelated to the new files.

---

## Concerns

- The `accuracy_scores` table query uses `.count` on a `Promise.resolve({ count: 0 })` fallback — TypeScript requires a cast `as { count: number | null }` since the mock shape differs from the Supabase response shape. This is safe at runtime.
- `is_public` defaults: if the DB column has no default and a new profile row omits it, `is_public` could be `null`. The check `profile.is_public === false` means `null` would pass through (profile would be shown). If stricter behavior is needed, change to `!profile.is_public`.
- Rankings preview shows only top 3 as specified. Full scored breakdown is available on the user's own results page at `/challenge/results`.

---

## Code Review Fix — 2026-08-01 (commit `52e0e3a`)

### Changes Made

**Critical 1 — Share card missing (`client.tsx`)**
- Imported `ResultsShareCard` from `@/components/oracle/ResultsShareCard`
- Added section 5 between season summary and rankings: renders `<ResultsShareCard overallScore={overallScore} percentile={percentile} />` only when `isScored && overallScore !== null && percentile !== null`

**Critical 2 — `is_public` column missing from schema**
- Created `supabase/migrations/20260801_user_profiles_is_public.sql` with `alter table user_profiles add column if not exists is_public boolean not null default true`
- Applied via Supabase MCP to project `lhqrkkhscdvpqidhjwcr` (pretty-much-picks) — success
- `UserProfileRow` interface in `page.tsx` already had `is_public: boolean`; select clause already named `is_public` — no code change needed

**Important 3 — Wrong percentile fallback (`page.tsx`)**
- Changed `scoreData?.global_rank ?? totalParticipants` to `scoreData?.global_rank ?? null`
- Gated percentile: `overallScore !== null && rank !== null ? computePercentile(...) : null`
- Client already gates "Top X%" display behind `percentile !== null`

**Important 4 — Hardcoded lock date string (`page.tsx` + `client.tsx`)**
- Added `lockDateLabel = ORACLE_LOCK_DATE.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })` derived server-side in `page.tsx`
- Added `lockDateLabel: string` to `ProfileClientProps` and destructuring in `client.tsx`
- Replaced hardcoded `"Rankings hidden until September 9"` with `Rankings hidden until {lockDateLabel}`

**Important 5 — Bare `as T` casts**
- All select clauses already cover every field in their respective Row interfaces — verified by inspection
- No changes needed; casts are acceptable Supabase service-client patterns as noted in the brief

### TypeScript Check Output
```
All errors are pre-existing test file issues (stale fixtures, missing @types/jest/@types/vitest).
Zero errors in app/u/ or any files touched by this fix.
```

### Build Output
```
✓ Compiled successfully in 1828ms
Finished TypeScript in 2.4s
/u/[username] — ƒ (Dynamic) server-rendered on demand
Build: PASS
```

### Commit
`52e0e3a` on branch `feature/multiplayer-m1`
