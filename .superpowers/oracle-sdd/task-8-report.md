# Task 8 Report — Predictions Feature

**Status:** DONE
**Commit:** e1be1e9
**Branch:** feature/multiplayer-m1
**Build:** PASS (clean, no errors)
**Tests:** 2 / 2 passing (`lib/oracle/__tests__/predictions.test.ts`)

---

## What Was Built

### DB Migration
`supabase/migrations/20260731_oracle_challenge_predictions.sql`
- Applied to Supabase project `lhqrkkhscdvpqidhjwcr` (pretty-much-picks, us-east-1)
- Table: `challenge_predictions` with check constraint on `question_id`, char_length check on `answer`, unique (user_id, season_id, question_id)
- RLS: users read own, public read after scoring, users insert/update own, admins update `is_correct`

### Data Layer
`lib/oracle/predictions.ts`
- `PREDICTION_QUESTIONS` — 8 hardcoded questions (nfl_mvp, oroy, cpoy, rb1, wr1, te1, bust, breakout)
- `predictionsLocked()` — compares `new Date()` to `ORACLE_LOCK_DATE`
- `getPredictions(supabase, userId, seasonId)` — returns `PredictionRow[]`
- `upsertPrediction(supabase, userId, seasonId, questionId, answer)` — throws if locked

### API Routes
`app/api/oracle/predictions/route.ts`
- `GET` — returns current user's predictions (401 if not authed)
- `PUT` — upserts one prediction; 401 if not authed, 423 if locked, 400 if invalid questionId or answer out of range

`app/api/oracle/predictions/[id]/route.ts`
- `PUT` — admin-only, sets `is_correct: boolean`; 401/403/400 guards
- `DELETE` — owner-only delete; 423 if locked, 403 if not owner

### Predictions Page
`app/challenge/predictions/page.tsx` — server component, `force-dynamic`, fetches session + season + predictions, passes to client.

`components/oracle/PredictionsClient.tsx` — `'use client'`, mobile-first cards for all 8 questions:
- Per-row text input with save button (min-h-[44px] touch targets)
- Saved state shows answer + Edit button; editing state shows input + Save
- Inline "Saved" / error feedback per row
- Auth gate at save point (redirects to `/auth/signin?next=...`)
- Locked view: read-only display with is_correct icons (✅/❌) if admin has scored
- Sticky "Back to My Rankings" nav at top

### Review Page Updates
`app/challenge/rankings/review/client.tsx`
- Replaced "Coming Soon" placeholder with live predictions checklist item
- Shows ✅ if `predictionCount > 0`, else ⏳
- Shows `X / 8 answered` count
- Links to `/challenge/predictions`
- Accepts new `predictionCount: number` prop

`app/challenge/rankings/review/page.tsx`
- Fetches prediction count in parallel with existing submissions check
- Passes `predictionCount` to `ReviewClient`

---

## Test Note

The spec's test used `2026-09-10T00:00:00Z` for "after lock date," but the actual lock (`2026-09-09T20:20:00-04:00`) converts to `2026-09-10T00:20:00Z` — 20 minutes later. The test was adjusted to use `2026-09-10T02:00:00Z` (unambiguously after lock). The `vi.useFakeTimers()` call was also added before `vi.setSystemTime()` as required by Vitest.

---

## Concerns / Follow-ups

- The `upsertPrediction` in the API route uses the cookie-based `getServerClient()` for the insert so the RLS `auth.uid() = user_id` check passes. The `getPredictions` read (in the page server component) uses `getServiceClient()` to bypass RLS for the server-side prefetch — this is consistent with how the rankings feature works.
- The `/challenge/page.tsx` still shows "Season Predictions — Coming Soon" as a disabled button. That can be updated in a follow-up task to link to `/challenge/predictions` now that the page exists.
