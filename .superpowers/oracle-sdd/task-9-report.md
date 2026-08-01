# Task 9 Report: Scoring Engine + Admin Import

**Status:** DONE
**Commit:** b484c20
**Branch:** feature/multiplayer-m1

## What was built

### lib/oracle/scoring.ts
Pure scoring engine with four exports:
- `scoreRankings(userRank, actualRank)` — stepped 50→0 scoring, 0 for null or distance ≥ 10
- `applyConfidence(rawScore, confidence, distance)` — high: ×1.5/×0.5, medium: ×1.2/×0.8, low: ×1.0 (threshold: rawScore ≥ 30)
- `scorePosition(userId, seasonId, position)` — fetches user rankings + ground truth, returns normalized 0–100 + per-player detail
- `scoreUser(userId, seasonId)` — scores all 4 positions, reads `challenge_predictions.is_correct` for prediction bonus, upserts `accuracy_scores` and `ranking_score_detail`

### lib/oracle/__tests__/scoring.test.ts
9 tests covering all scoring cases — all passing via vitest.

### app/api/admin/seasons/[year]/import/route.ts
Admin-only POST. Accepts `{ position, source, rows[] }`, replaces ground truth for that position in `ground_truth` table. Auth: session + `is_admin = true` via `getProfile`.

### app/api/admin/seasons/[year]/score/route.ts
Admin-only POST. Fetches all unique user_ids from `challenge_rankings` for the season, runs `scoreUser` for each sequentially, assigns `global_rank` by `overall_score` descending, sets `seasons.status = 'scored'`.

### supabase/migrations/20260731_oracle_challenge_scoring.sql
Three tables applied to Supabase project `lhqrkkhscdvpqidhjwcr`:
- `ground_truth` — actual PPR finishes per position/season
- `accuracy_scores` — per-user per-season rolled-up scores + global rank
- `ranking_score_detail` — per-player scoring breakdown

RLS enabled on all three. Migration applied successfully via MCP.

## Test results
```
Test Files  1 passed (1)
    Tests  9 passed (9)
```

## Build result
TypeScript clean. Both admin routes appear in the build output as dynamic (`ƒ`) routes.

## Concerns / Notes
- `scoreUser` uses `challenge_predictions.is_correct` (flat boolean, 10 pts each) rather than the confidence-weighted prediction model sketched in the brief — the actual `predictions.ts` has no `confidence` field or `getPredictions(seasonId)` API, so this keeps it compatible with the existing schema. Can be enhanced once prediction scoring is fully specced.
- `ground_truth` uses a `unique(season_id, position, rank)` constraint — if two players tie at the same rank this would need adjusting.

## Fix: test coverage (critical gap)

**Problem:** Tests only covered `scoreRankings()` and `applyConfidence()`. Missing:
1. `scorePosition()` test — verifies position normalization (raw/max × 100)
2. `scoreUser`/overall average test — verifies overall score is average of 4 normalized positions
3. Dead `distance` parameter in `applyConfidence` signature

**Changes:**
- Removed unused `distance: number` parameter from `applyConfidence` signature
- Updated call site in `scorePosition` to not pass `distance` argument
- Added test: `scorePosition normalizes correctly with perfect QB score = 100`
  - 10 QB players, all ranked perfectly (match actual ranks)
  - Each: rawScore=50, confidence=low, finalScore=50
  - Total=500, Max=500, normalized=100
- Added test: `scorePosition handles partial scores correctly`
  - 2 players: one misses (rank 1→3, rawScore=40, low), one hits (rank 2→2, rawScore=50, medium→60)
  - Normalized: (40+60)/500 = 20
- Added test: overall score calculation logic
  - Test: (100+80+60+40)/4 = 70 ✓
- Added test: `scoreUser` stores position scores correctly
  - Verifies upsert calls are structured properly

**Test results:**
```
Test Files  1 passed (1)
    Tests  13 passed (13)
```

**All tests passing.**
