# Oracle Scoring & Weekly Pipeline — Design Spec

**Date:** 2026-08-02
**Status:** Approved — ready for implementation

---

## Goal

Implement a mathematically fair, deterministic, fully automated scoring engine and weekly synchronization pipeline for the 2026 Oracle Challenge. Users rank the top 10 players per position (QB/RB/WR/TE) before the season locks on September 9. Every Tuesday throughout the NFL regular season, the pipeline re-syncs player stats, rebuilds cumulative PPR rankings, re-scores every Oracle entry, and updates the leaderboard with movement tracking.

## Architecture

The system divides cleanly into three layers:

1. **Pure scoring engine** (`lib/oracle/scoring.ts`) — side-effect-free functions that receive data and return numbers. No I/O. Fully deterministic. Independently testable.
2. **Weekly pipeline** (`lib/oracle/pipeline.ts` + step modules) — orchestrates data fetching, DB writes, scoring, and ranking every Tuesday.
3. **Database** (Supabase/Postgres) — single source of truth. External APIs are synchronization sources only; they never drive feature behavior at request time.

## Tech Stack

- Next.js App Router, TypeScript, Supabase (Postgres + RLS), Vercel Cron
- Sleeper API (player stats source, cumulative PPR via `pts_ppr` field)
- Vitest (unit + integration tests), fast-check (property-based tests — `npm install -D fast-check` required)

---

## Global Constraints

- Scoring algorithm: V1 Linear Distance-Decay — frozen after beta. Any future change requires a new `SCORING_ALGORITHM_VERSION`, a new migration, and a full regression test pass.
- All position scores are integers 0–100. Overall score is stored full-precision (multiples of 0.25, IEEE 754 exact). Rounding for display only — never in storage.
- The scoring engine must be completely stateless and parallelizable. No shared mutable state between users.
- The weekly pipeline must be idempotent. Re-running for the same week produces the same result with no duplicate data.
- External APIs (Sleeper) are synchronization-only. No feature code calls them at request time.
- `oracle_entries.entered_at` and `entry_number` are immutable after first insertion. `ON CONFLICT DO NOTHING` enforces this at the DB level.
- `league_state.current_week` is always synced from the NFL provider — never manually incremented.
- `dryRun=true` must execute the full pipeline logic without writing any data.
- Every pipeline execution is identified by a `pipeline_run_id` (UUID) shared across all sync, score, leaderboard, and log operations within that run.

---

## Section 1: Scoring Engine (Pure Functions)

### Algorithm: V1 Linear Distance-Decay

```
SCORING_ALGORITHM_VERSION = 'v1'
LIST_SIZE = 10   (POSITION_LIST_SIZE per position)

For each pick in user's top 10 for a position:
  actualRank = ground_truth_rank(pick.playerId)   // null if player outside top 10

  if actualRank is null OR actualRank > LIST_SIZE:
    playerScore = 0                                // miss — no points, no penalty
  else:
    distance = |pick.playerRank - actualRank|
    playerScore = LIST_SIZE - distance             // range: 1 to 10 (always ≥ 1 for hits)

positionRawScore = sum(playerScore for all picks)  // 0–100, integer
```

**Key invariant:** Any player finishing in the actual top 10 always earns ≥ 1 point, regardless of how wrong the rank is. Any player finishing outside the top 10 earns exactly 0. This guarantees that "correct player, wrong rank" always beats "wrong player entirely."

**Overall score:** `(scoreQB + scoreRB + scoreWR + scoreTE) / 4`
- Sum of 4 integers (0–400) divided by 4 — always a multiple of 0.25, exactly representable in IEEE 754.
- Stored full-precision. Rounded to 1 decimal place at display layer only.

### Core Types

```typescript
export const SCORING_ALGORITHM_VERSION = 'v1' as const
export type ScoringAlgorithmVersion = typeof SCORING_ALGORITHM_VERSION

type Pick = { playerId: string; playerRank: number }
type GroundTruth = ReadonlyMap<string, number>  // playerId → actualRank (1–10)

type PositionScoreResult = {
  rawScore: number        // 0–100, integer
  exactMatches: number    // picks where playerRank === actualRank
  totalRankError: number  // sum of |userRank - actualRank| for in-top-10 picks only
  top10Hits: number       // count of picks that landed in the actual top 10
}

type EntryScore = {
  scoreQB: number         // 0–100, integer
  scoreRB: number
  scoreWR: number
  scoreTE: number
  overallScore: number    // full-precision average, stored as-is
  exactMatches: number    // total across all 4 positions
  totalRankError: number  // total across all 4 positions
  top10Hits: number       // total across all 4 positions
  scoringAlgorithmVersion: ScoringAlgorithmVersion
}
```

### Validation (runs before scoring)

```typescript
function validatePicks(picks: Pick[]): void {
  const playersSeen = new Set<string>()
  const ranksSeen = new Set<number>()
  for (const p of picks) {
    if (p.playerRank < 1 || p.playerRank > LIST_SIZE)
      throw new Error(`Rank out of range: ${p.playerRank}`)
    if (playersSeen.has(p.playerId))
      throw new Error(`Duplicate player: ${p.playerId}`)
    if (ranksSeen.has(p.playerRank))
      throw new Error(`Duplicate rank: ${p.playerRank}`)
    playersSeen.add(p.playerId)
    ranksSeen.add(p.playerRank)
  }
  // Partial lists (< 10 picks) are valid — missing picks score 0.
}
```

### Pure Scoring Functions

```typescript
export function scorePosition(
  picks: ReadonlyArray<Pick>,
  groundTruth: GroundTruth,
): PositionScoreResult {
  let rawScore = 0, exactMatches = 0, totalRankError = 0, top10Hits = 0
  for (const pick of picks) {
    const actualRank = groundTruth.get(pick.playerId) ?? null
    if (actualRank == null || actualRank > LIST_SIZE) continue
    const distance = Math.abs(pick.playerRank - actualRank)
    rawScore += LIST_SIZE - distance
    totalRankError += distance
    top10Hits++
    if (distance === 0) exactMatches++
  }
  return { rawScore, exactMatches, totalRankError, top10Hits }
}

export function scoreEntry(
  results: Record<OraclePosition, PositionScoreResult>,
): EntryScore {
  const [qb, rb, wr, te] = ORACLE_POSITIONS.map(p => results[p])
  return {
    scoreQB: qb.rawScore,
    scoreRB: rb.rawScore,
    scoreWR: wr.rawScore,
    scoreTE: te.rawScore,
    overallScore: (qb.rawScore + rb.rawScore + wr.rawScore + te.rawScore) / 4,
    exactMatches: qb.exactMatches + rb.exactMatches + wr.exactMatches + te.exactMatches,
    totalRankError: qb.totalRankError + rb.totalRankError + wr.totalRankError + te.totalRankError,
    top10Hits: qb.top10Hits + rb.top10Hits + wr.top10Hits + te.top10Hits,
    scoringAlgorithmVersion: SCORING_ALGORITHM_VERSION,
  }
}
```

### Tiebreaker Chain

When two entries have identical `overallScore`, rank by:
1. `exactMatches DESC` — more exact rank placements wins
2. `totalRankError ASC` — lower total distance among in-top-10 hits wins
3. `entry_number ASC` — earlier submission wins (last resort only)

---

## Section 2: Database Schema Changes

### New table — `player_stats`

```sql
create table player_stats (
  id          uuid primary key default gen_random_uuid(),
  season_year int not null,
  week        int not null check (week >= 1),   -- no upper limit: future-proof for playoffs
  player_id   text not null,                     -- matches player_cache.id
  position    text not null check (position in ('QB','RB','WR','TE','K','DEF')),
  pts_ppr     numeric(7,2) not null default 0,
  provider    text not null default 'sleeper',
  external_id text,                              -- Sleeper player_id
  game_id     uuid references games(id),         -- nullable until game records are synced
  last_synced_at timestamptz not null default now(),
  unique (season_year, week, player_id)
);
create index player_stats_season_week on player_stats (season_year, week);
create index player_stats_player      on player_stats (player_id, season_year);
```

### New table — `oracle_entries`

One row per user per season. Immutable after first insertion — `ON CONFLICT DO NOTHING` enforces this at the DB level. `entered_at` and `entry_number` never change after the initial INSERT.

```sql
create table oracle_entries (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  season_id           uuid not null references seasons(id) on delete cascade,
  entry_number        int  not null generated always as identity,  -- monotonic, concurrent-safe
  entered_at          timestamptz not null default now(),
  submission_metadata jsonb not null default '{}',  -- IP bucket, UA hash, source — fraud/analytics
  unique (user_id, season_id)
);
-- Immutability note: INSERT ... ON CONFLICT (user_id, season_id) DO NOTHING
-- ensures entry_number and entered_at are never overwritten on re-submission.
```

### New table — `league_state`

```sql
create table league_state (
  id             uuid primary key default gen_random_uuid(),
  sport          text not null default 'nfl',
  season_year    int  not null,
  current_week   int  not null default 0,    -- 0 = pre-season; synced from Sleeper /state/nfl
  season_phase   text not null default 'pre'
                   check (season_phase in ('pre','regular','playoffs','complete')),
  last_synced_at  timestamptz,
  last_scored_at  timestamptz,
  next_sync_at    timestamptz,
  unique (sport, season_year)
);
insert into league_state (sport, season_year, current_week, season_phase)
values ('nfl', 2026, 0, 'pre')
on conflict (sport, season_year) do nothing;
```

`current_week` is always written from `Sleeper /state/nfl` response — never incremented manually by application code.

### Modified — `accuracy_scores`

```sql
alter table accuracy_scores
  add column if not exists exact_matches             int  not null default 0,
  add column if not exists total_rank_error          int  not null default 0,
  add column if not exists top10_hits                int  not null default 0,
  add column if not exists prev_rank                 int,
  add column if not exists rank_change               int,
  add column if not exists current_week              int  not null default 0,
  add column if not exists last_scored_at            timestamptz,
  add column if not exists scoring_algorithm_version text not null default 'v1',
  drop column if exists is_projected;   -- replaced by current_week semantics (0 = pre-season)

-- Composite index covering the full tiebreaker ORDER BY
create index accuracy_scores_rank_order
  on accuracy_scores (season_id, overall_score desc, exact_matches desc, total_rank_error asc);
```

`overall_score` column type is already `numeric` — no change needed. Stored full-precision.

### Modified — `ranking_score_detail`

```sql
alter table ranking_score_detail
  drop column if exists confidence,
  add column if not exists in_top10                boolean not null default false,
  add column if not exists scoring_algorithm_version text   not null default 'v1';
```

`confidence` was never used. `in_top10` enables future Community Rankings and Biggest Hit/Miss queries without rescoring.

### Modified — `ground_truth`

```sql
alter table ground_truth
  add column if not exists updated_week   int,
  add column if not exists provider       text not null default 'sleeper',
  add column if not exists last_synced_at timestamptz;
```

`updated_week` records which NFL week's cumulative data produced these rankings — auditable.

### Modified — `sync_jobs`

```sql
alter table sync_jobs
  add column if not exists pipeline_run_id uuid,
  add column if not exists metadata         jsonb not null default '{}';
```

`pipeline_run_id` links every sync_jobs row to the pipeline execution that produced it (traceable across all steps). `metadata` stores structured per-run data (week, dry_run flag, scored/ranked counts) without future schema changes.

---

## Section 3: Weekly Synchronization Pipeline

### Architecture

Single Vercel Cron job → single orchestrated route → five pipeline steps, each an independently exportable module.

```
app/api/sync/weekly/route.ts     — Vercel Cron entry (Tuesday 14:00 UTC = 10am ET)
lib/oracle/pipeline.ts           — Orchestration; owns pipeline_run_id
lib/oracle/stats-sync.ts         — Step 1: Sleeper /stats → player_stats
lib/oracle/ground-truth.ts       — Step 2: cumulative PPR → ground_truth rebuild
lib/oracle/scoring.ts            — Step 3: score all submitted entries (pure functions + DB writes)
lib/oracle/ranking.ts            — Step 4: assign global_rank + movement
```

The existing `/api/oracle/scoring/recalculate` Vercel Cron job is removed. Its logic is absorbed into the pipeline.

### Week Resolution

```typescript
// Week to process, in priority order:
// 1. ?week=N query param (admin override — supports catch-up runs)
// 2. Sleeper /state/nfl current week (authoritative for automated runs)
const weekParam = new URL(request.url).searchParams.get('week')
const sleeperState = await fetchSleeperState()   // GET /v1/state/nfl
const week = weekParam ? parseInt(weekParam, 10) : sleeperState.week

// Update league_state to mirror provider reality
await db.from('league_state')
  .update({ current_week: sleeperState.week, season_phase: sleeperState.season_type, last_synced_at: now })
  .eq('sport', 'nfl').eq('season_year', 2026)
```

`current_week` in the DB always mirrors the provider — it is never incremented by application logic.

### Pipeline Execution

```typescript
const pipelineRunId = crypto.randomUUID()
const dryRun = new URL(request.url).searchParams.get('dryRun') === 'true'

// All writes guarded by: if (!dryRun) { ... }
```

Every sync, score calculation, leaderboard update, and log record carries `pipeline_run_id` for full traceability.

### Step 1 — Sync player stats from Sleeper

- Endpoint: `GET https://api.sleeper.app/v1/stats/nfl/regular/2026/{week}`
- Returns `{ [player_id]: { pts_ppr: 14.2, rec: 4, ... } }`
- Store `pts_ppr` directly from Sleeper — no re-computation of the PPR formula
- Upsert on `(season_year, week, player_id)` — idempotent, handles Sleeper stat corrections
- Retry logic: up to 3 attempts with exponential backoff (500ms, 1s, 2s) before marking failed
- If Sleeper returns a non-2xx after retries: abort pipeline, write `sync_jobs` failure, return 500

### Step 2 — Rebuild ground_truth from cumulative PPR

```sql
-- Compute cumulative PPR per player through current week
WITH cumulative AS (
  SELECT ps.player_id, pc.position, SUM(ps.pts_ppr) AS total_ppr
  FROM player_stats ps
  JOIN player_cache pc ON pc.id = ps.player_id
  WHERE ps.season_year = :season_year
    AND ps.week <= :week
    AND pc.position IN ('QB','RB','WR','TE')
  GROUP BY ps.player_id, pc.position
),
ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY position ORDER BY total_ppr DESC) AS rnk
  FROM cumulative
)
SELECT * FROM ranked WHERE rnk <= 10
```

For each position: delete existing `ground_truth` rows for `(season_id, position)`, then insert new top-10. Wrapped in a per-position transaction — partial failure doesn't corrupt other positions. Sets `updated_week` and `last_synced_at` on every inserted row.

If Step 2 fails: abort before Step 3. Scores must not be calculated against stale or corrupt ground truth.

### Step 3 — Score all submitted Oracle entries

```typescript
// Stateless, parallelizable — no shared state between users
const BATCH_SIZE = 100
for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
  await Promise.all(userIds.slice(i, i + BATCH_SIZE).map(userId =>
    scoreUser(userId, seasonId, pipelineRunId, dryRun)
  ))
}
```

Per-user failures are caught, logged with `pipeline_run_id`, and do not abort the pipeline. The `scoreUser` function (existing, now fully implemented with V1 algorithm) writes to `accuracy_scores` and `ranking_score_detail`.

### Step 4 — Assign global ranks and track movement

```sql
SELECT a.user_id, a.overall_score, a.exact_matches, a.total_rank_error,
       e.entry_number, a.global_rank AS prev_rank
FROM accuracy_scores a
JOIN oracle_entries e ON e.user_id = a.user_id AND e.season_id = a.season_id
WHERE a.season_id = :season_id
ORDER BY
  a.overall_score    DESC,
  a.exact_matches    DESC,
  a.total_rank_error ASC,
  e.entry_number     ASC
```

Then update each row:
```typescript
{
  global_rank:  newRank,
  prev_rank:    row.prev_rank,
  rank_change:  (row.prev_rank ?? newRank) - newRank,   // positive = moved up
  current_week: week,
  last_scored_at: now,
}
```

### Leaderboard History (extension point)

The pipeline writes `global_rank`, `prev_rank`, and `rank_change` to `accuracy_scores` in-place each week. A future `leaderboard_snapshots` table can store weekly copies without any pipeline changes:

```sql
-- Future table (not built now):
create table leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references seasons(id),
  week int not null,
  user_id uuid references auth.users(id),
  global_rank int not null,
  overall_score numeric not null,
  rank_change int,
  snapshot_at timestamptz not null default now()
);
```

The pipeline would add one `INSERT INTO leaderboard_snapshots SELECT ... FROM accuracy_scores` at the end of Step 4. Architecture unchanged.

### Pipeline Completion

On full success:
```typescript
await db.from('sync_jobs').insert({
  resource: 'weekly_pipeline',
  provider: 'sleeper',
  status: 'success',
  pipeline_run_id: pipelineRunId,
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  records_processed: scoredCount,
  metadata: { week, dry_run: dryRun, scored: scoredCount, ranked: rankedCount },
})
```

On any step failure: `status: 'failed'`, include failing step name. `current_week` is not manually changed — Sleeper state was already written at the top of the route.

### Catch-Up Runs

If Week 4 fails, admin runs `POST /api/sync/weekly?week=4` manually. The cumulative SQL naturally incorporates Week 4 when Week 5 subsequently runs. Scores for both weeks will be correct.

### Updated `vercel.json`

```json
{
  "crons": [
    { "path": "/api/sync/players", "schedule": "0 6 * * *" },
    { "path": "/api/sync/weekly",  "schedule": "0 14 * * 2" }
  ]
}
```

---

## Section 4: Test Plan

### 4A — Unit Tests (`lib/oracle/__tests__/scoring.test.ts`)

**Group A — `validatePicks`**

| # | Input | Expected |
|---|---|---|
| A1 | 10 picks, unique IDs, ranks 1–10 | No throw |
| A2 | 7 picks, unique IDs, ranks 1–7 | No throw (partial lists valid) |
| A3 | `[]` | No throw |
| A4 | Duplicate player ID | Throws `"Duplicate player"` |
| A5 | Duplicate rank | Throws `"Duplicate rank"` |
| A6 | `playerRank: 0` | Throws `"Rank out of range"` |
| A7 | `playerRank: 11` | Throws `"Rank out of range"` |

**Group B — `scorePosition` fundamentals**
Ground truth: P1–P10 ranked 1–10.

| # | Description | rawScore | exactMatches | totalRankError | top10Hits |
|---|---|---|---|---|---|
| B1 | Perfect | 100 | 10 | 0 | 10 |
| B2 | All off by 1 (cycled) | 90 | 0 | 10 | 10 |
| B3 | All off by 3 (cycled) | 70 | 0 | 30 | 10 |
| B4 | All off by 9 (max distance, cycled) | 10 | 0 | 90 | 10 |
| B5 | All busts (nobody in top 10) | 0 | 0 | 0 | 0 |
| B6 | 5 exact hits + 5 busts | 50 | 5 | 0 | 5 |
| B7 | Empty picks | 0 | 0 | 0 | 0 |
| B8 | Single exact pick (#1) | 10 | 1 | 0 | 1 |
| B9 | Single off-by-5 pick (P1@6, finishes #1) | 5 | 0 | 5 | 1 |

**Group C — Key design principle (must never regress)**

| # | Description | Must hold |
|---|---|---|
| C1 | Chase@2 finishes #5 (7 pts) vs Kupp@2 finishes #37 (0 pts) | 7 > 0 |
| C2 | Player@1 finishes #10 (distance=9) | 1 pt, not 0 |
| C3 | Player@5 finishes #10 (distance=5) | 5 pts |
| C4 | Player@5 finishes #11 | 0 pts |
| C5 | C2 vs C4 | 1 > 0 |

**Group D — `scoreEntry` aggregation and precision**

| # | Position scores | overallScore | Notes |
|---|---|---|---|
| D1 | All 100 | 100.0 | No rounding |
| D2 | All 0 | 0.0 | |
| D3 | 80/70/90/60 | 75.0 | Integer result |
| D4 | 80/70/90/65 | 76.25 | IEEE 754 exact — stored as 76.25, not 76.3 |
| D5 | 81/71/91/66 | 77.25 | Verify no float drift |
| D6 | exactMatches: 3+2+4+1 per position | 10 total | |
| D7 | totalRankError: 5+3+8+2 per position | 18 total | |
| D8 | top10Hits: 8+7+9+6 per position | 30 total | |

**Group E — Tiebreaker ordering**

| # | Scenario | Winner |
|---|---|---|
| E1 | Same score, A has 8 exact vs B has 6 | A (exactMatches) |
| E2 | Same score + exact, A rankError=12 vs B rankError=18 | A (lower error) |
| E3 | Same everything, A entryNumber=42 vs B entryNumber=107 | A (earlier entry) |
| E4 | A score=76 exact=2 error=30 vs B score=75 exact=10 error=0 | A (score wins first) |
| E5 | 4-user chain: scores equal, exacts 5/5/5/3, errors 10/10/20/5, entries 1/2/1/1 | Rank: C, A, B, D |

**Group F — Partial season validity**

| # | Ground truth state | Expected behavior |
|---|---|---|
| F1 | Week 1: full 10 per position | Normal scoring |
| F2 | Sparse: only 6 QBs ranked | Picks for missing slots earn 0 — no crash |
| F3 | Week 18: same algorithm, final data | Identical code path to Week 1 |
| F4 | All players at 0 PPR (pre-season test) | ROW_NUMBER assigns arbitrary ranks; scoring runs cleanly |

**Group G — Determinism**

| # | Assertion |
|---|---|
| G1 | `scorePosition(picks, gt)` called twice returns deep-equal result |
| G2 | `scoreEntry(results)` called twice → `overallScore ===` strict equality |
| G3 | 80/70/90/65 → `overallScore === 76.25` (not 76.24999...) |
| G4 | `SCORING_ALGORITHM_VERSION === 'v1'` (compile-time constant) |

**Group H — Regression protection**

| # | Scenario | Invariant |
|---|---|---|
| H1 | 10 hits all off-by-2 | rawScore=80, top10Hits=10 |
| H2 | 8 exact hits + 2 misses | rawScore=80, top10Hits=8, exactMatches=8 |
| H3 | H1 vs H2 tiebreak | H2 wins (exactMatches 8 > 0) |
| H4 | User's pick scores 0 PPR (injury) | Still in top 10 if others also scored 0; algorithm unaffected |

---

### 4B — Property-Based Tests (`lib/oracle/__tests__/scoring.property.test.ts`)

Using `fast-check` to generate thousands of random valid rankings.

**Invariants that must always hold:**

1. `scorePosition(picks, gt).rawScore` is always an integer in [0, 100]
2. `scoreEntry(results).overallScore` is always in [0.0, 100.0]
3. `scoreEntry(results).overallScore` is always a multiple of 0.25
4. Perfect picks always score 100 per position
5. Perfect picks always have higher `rawScore` than any imperfect picks for the same ground truth
6. Any pick with a player in the actual top 10 always scores ≥ 1 point
7. Any pick with a player outside the actual top 10 always scores exactly 0 points
8. Same input always produces byte-identical output (determinism across 1000 runs)
9. `top10Hits` is always in [0, min(picks.length, LIST_SIZE)]
10. `exactMatches` is always ≤ `top10Hits`

---

### 4C — Pipeline Integration Tests (`lib/oracle/__tests__/pipeline.integration.test.ts`)

Use a test database (Supabase local or in-memory Postgres) with seeded fixtures.

| # | Scenario | Assertions |
|---|---|---|
| I1 | Full Week 1 run | player_stats upserted; ground_truth rebuilt; all submitted entries scored; leaderboard assigned |
| I2 | Idempotency: run Week 1 twice | Zero duplicate rows; scores identical on both runs |
| I3 | Week 5 provider correction | Re-running Week 5 with updated pts_ppr produces updated scores; no orphaned rows |
| I4 | Step 3 failure mid-scoring | player_stats and ground_truth intact; accuracy_scores partially updated (logged, not aborted) |
| I5 | Step 2 failure (ground_truth rebuild) | Aborts before scoring; accuracy_scores unchanged; sync_jobs records failure |
| I6 | Catch-up: Week 4 missed, then Week 4 + Week 5 run | Cumulative totals for Week 5 include Week 4 data; final scores equal to uninterrupted run |
| I7 | `dryRun=true` | Full pipeline logic executes; zero DB writes; sync_jobs NOT written |
| I8 | Provider timeout (mocked) | Retries 3 times with backoff; marks failed after final retry; no partial data |
| I9 | Incomplete Sleeper response (50% of players missing) | Only present players written; ground_truth rebuilt from available data; no crash |
| I10 | Empty weekly stats (all pts_ppr = 0) | player_stats upserted with 0s; ground_truth rebuilt (arbitrary rank order); scores reflect 0s |
| I11 | Cron fires twice simultaneously | Second run detects pipeline already running (or is idempotent regardless — upsert handles it) |
| I12 | Manual catch-up `?week=4` followed by normal `?week=5` | Results match a single uninterrupted run through Week 5 |

---

### 4D — Performance Benchmarks (`lib/oracle/__tests__/scoring.bench.ts`)

Measure on realistic data before beta, with user counts: 1,000 / 5,000 / 10,000 / 50,000.

For each scale, measure:
- Total scoring time (Step 3)
- Leaderboard generation time (Step 4, including ORDER BY)
- Total DB writes (count of upserted rows)
- Peak memory usage during scoring
- Total query count

**Target:** 10,000 users scored in < 60 seconds on Vercel's standard serverless function limits. If this target cannot be met, the batch parallelism in Step 3 (`BATCH_SIZE`) is the primary tuning lever. No architectural change needed.

---

### 4E — Golden Test Fixtures

Permanent regression datasets. Any future implementation of `scorePosition` / `scoreEntry` must produce identical outputs for all five fixtures.

| Fixture | Description |
|---|---|
| `fixture-perfect-season.json` | User correctly predicts all 40 players at exact ranks. Expected: all positions 100.0, overall 100.0. |
| `fixture-average-season.json` | User gets ~60% of players right, all off by 2–3 spots. Expected scores pre-computed and frozen. |
| `fixture-terrible-season.json` | User gets 2/10 per position, all wrong players. Expected: all positions near 0. |
| `fixture-injury-season.json` | 4 players per position on user's list suffer season-ending injuries (Week 1). All finish outside top 10. Expected: significant 0-point picks; no negative scores. |
| `fixture-high-tie-season.json` | Multiple users have identical overall scores. Tiebreaker chain resolves correctly to a deterministic ranking. |

Fixtures live in `lib/oracle/__tests__/fixtures/`. Each fixture is a JSON file with `{ picks, groundTruth, expectedResult }`.

---

### 4F — Pipeline Recovery Tests

| # | Scenario | Expected recovery |
|---|---|---|
| R1 | Provider timeout | 3 retries with exponential backoff; failure recorded in sync_jobs; pipeline aborts cleanly |
| R2 | Partial DB failure (connection drop mid-upsert) | Transaction rolls back; player_stats in consistent state; next run succeeds |
| R3 | Cron running twice | Idempotent upserts handle it; no duplicate sync_jobs rows beyond one per run_id |
| R4 | Cron skipped for a week | Catch-up run `?week=N` fully restores that week; subsequent normal run is correct |
| R5 | Manual catch-up for missed week | Cumulative SQL picks up missed week's data automatically |
| R6 | Provider returns incomplete data | Partial player_stats written; ground_truth reflects available data; sync_jobs records partial count |
| R7 | Empty weekly stats from provider | All pts_ppr = 0; ground_truth rebuilt with arbitrary ordering; scores valid (likely all 0); no crash |

---

## Section 5: Scoring Engine Freeze

Once all tests in 4A–4F pass and the scoring engine is deployed for real users, the algorithm is frozen.

**To change the scoring algorithm in the future:**
1. Define `SCORING_ALGORITHM_VERSION = 'v2'`
2. Create a new migration adding any required columns
3. Implement `scorePositionV2` alongside `scorePositionV1` (never delete the old version)
4. Run the full golden fixture regression test suite against both versions
5. Deploy and re-score all entries using the new version
6. All `accuracy_scores` rows store their `scoring_algorithm_version` — historical scores remain queryable by version

This process is required regardless of how small the change is.

---

## Section 6: Rollout

1. **Now (pre-season):** Implement scoring engine + all tests. Tests must pass before any pipeline work begins.
2. **Pre-season:** Implement pipeline (stats-sync, ground-truth, ranking). Test with mock/prior-season data.
3. **Pre-Week-1:** Deploy. Verify `dryRun=true` executes cleanly. Run benchmark tests against production scale estimate.
4. **September 9, 2026:** Lock date. Rankings frozen. No scoring needed yet.
5. **September 15, 2026 (first Tuesday after Week 1):** First live pipeline run. Admin monitors `sync_jobs` for status.
6. **Week 2+:** Automated Tuesday runs. Monitor `sync_jobs` and leaderboard for anomalies.
7. **After Week 18:** Final cumulative PPR rankings become official. `league_state.season_phase = 'complete'`. Leaderboard locked permanently.
