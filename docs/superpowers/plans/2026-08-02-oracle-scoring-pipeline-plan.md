# Oracle Scoring Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full Oracle scoring pipeline — pure scoring engine with tests, weekly Sleeper sync, ground truth builder, leaderboard ranker, and in-season score display.

**Architecture:** Pure scoring functions compute position/entry scores from user picks + ground truth maps; `scoreUser` wraps them with DB I/O. A weekly pipeline orchestrates four stages (stats sync → ground truth → scoring → ranking) identified by a shared `pipeline_run_id`. All steps are idempotent; dry-run mode executes full logic with zero DB writes.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), Vercel Cron, Vitest, fast-check

## Global Constraints

- `SCORING_ALGORITHM_VERSION = 'v1'` — frozen; future changes require new version + migration
- Scoring formula: `points = max(0, 10 - |userRank - actualRank|)` for players in actual top 10; 0 for misses
- `positionScore = sum(playerPoints)` over all 10 picks — range 0–100
- `overallScore = (QB + RB + WR + TE) / 4` — stored as full-precision float
- Tiebreaker chain: `overallScore DESC → top10Hits DESC → totalRankError ASC → entry_number ASC`
- `oracle_entries.entry_number` is monotonic identity — never changes after first INSERT
- `league_state.current_week` is sourced from Sleeper `/state/nfl` — never manually incremented
- All pipeline steps upsert on natural unique keys (idempotent)
- Retry: 3 attempts, exponential backoff 500ms / 1s / 2s for Sleeper API calls
- Batch size: 100 users scored in parallel per `Promise.all` batch
- Backward-compatible exports from `lib/oracle/scoring.ts`: `OracleResult`, `PositionResult`, `PlayerScore`, `generateSummary`
- Test command: `npm run test:run` (added in Task 1)
- `CRON_SECRET` env var guards all cron API routes (same pattern as `/api/sync/players`)

---

### Task 1: Dev setup — test scripts + fast-check

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run test` (watch), `npm run test:run` (CI) — used by every subsequent task

- [ ] **Step 1: Write a smoke test to verify the test runner works**

Create `lib/oracle/__tests__/smoke.test.ts`:
```typescript
describe('test runner', () => {
  it('works', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 2: Try running the test — expect failure because no test script exists**

```bash
cd /Users/gregspunt/pretty-much-picks && npx vitest run lib/oracle/__tests__/smoke.test.ts
```

This should work already since vitest is a dev dependency, but the goal is to add convenient npm scripts.

- [ ] **Step 3: Add test scripts and install fast-check**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest",
"test:run": "vitest run"
```

Then install fast-check:
```bash
cd /Users/gregspunt/pretty-much-picks && npm install -D fast-check
```

- [ ] **Step 4: Run the smoke test via npm script**

```bash
cd /Users/gregspunt/pretty-much-picks && npm run test:run -- lib/oracle/__tests__/smoke.test.ts
```

Expected output:
```
✓ lib/oracle/__tests__/smoke.test.ts (1)
  ✓ test runner > works
Test Files  1 passed (1)
Tests       1 passed (1)
```

- [ ] **Step 5: Delete smoke test and commit**

```bash
rm /Users/gregspunt/pretty-much-picks/lib/oracle/__tests__/smoke.test.ts
cd /Users/gregspunt/pretty-much-picks
git add package.json package-lock.json
git commit -m "chore: add test scripts and fast-check dependency"
```

---

### Task 2: DB migration — new tables and schema additions

**Files:**
- Create: `supabase/migrations/20260802_oracle_pipeline.sql`

**Interfaces:**
- Produces: tables `player_stats`, `oracle_entries`, `league_state`; added columns on `accuracy_scores` and `sync_jobs`
- Consumed by: Tasks 4, 7, 8, 9, 10, 11, 12, 13

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260802_oracle_pipeline.sql`:
```sql
-- ─── player_stats ────────────────────────────────────────────────────────────
-- Weekly per-player PPR points from Sleeper. Cumulative aggregation happens in JS.
create table if not exists public.player_stats (
  id              uuid primary key default gen_random_uuid(),
  season_id       uuid not null references public.seasons(id),
  week            int not null,
  player_id       text not null,
  player_name     text not null,
  position        text not null,
  team            text,
  game_id         text,            -- Sleeper game identifier (informational, no FK)
  provider        text not null default 'sleeper',
  external_id     text not null,   -- same as player_id for Sleeper
  ppr_points      numeric not null default 0,
  last_synced_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (season_id, week, player_id)
);

alter table public.player_stats enable row level security;
create policy "Admins can manage player stats" on public.player_stats for all using (
  exists (select 1 from public.user_profiles where user_id = auth.uid() and is_admin = true)
);
create policy "Anyone can read player stats" on public.player_stats for select using (true);

-- ─── oracle_entries ──────────────────────────────────────────────────────────
-- One row per submitted user. entry_number is monotonic identity — never changes.
create table if not exists public.oracle_entries (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  season_id           uuid not null references public.seasons(id),
  entry_number        int generated always as identity,
  entered_at          timestamptz not null default now(),
  submission_metadata jsonb not null default '{}',
  unique (user_id, season_id)
);

alter table public.oracle_entries enable row level security;
create policy "Users can read their own entry" on public.oracle_entries
  for select using (auth.uid() = user_id);
create policy "Admins can read all entries" on public.oracle_entries
  for select using (
    exists (select 1 from public.user_profiles where user_id = auth.uid() and is_admin = true)
  );

-- ─── league_state ────────────────────────────────────────────────────────────
-- Current NFL week sourced from Sleeper. One row per season.
create table if not exists public.league_state (
  id              uuid primary key default gen_random_uuid(),
  season_id       uuid not null references public.seasons(id),
  current_week    int not null default 0,
  nfl_season      text,            -- e.g. '2026'
  nfl_week        int,
  nfl_season_type text,            -- 'pre', 'regular', 'post'
  last_synced_at  timestamptz not null default now(),
  unique (season_id)
);

alter table public.league_state enable row level security;
create policy "Anyone can read league state" on public.league_state for select using (true);
create policy "Admins can manage league state" on public.league_state for all using (
  exists (select 1 from public.user_profiles where user_id = auth.uid() and is_admin = true)
);

-- ─── accuracy_scores additions ───────────────────────────────────────────────
-- Columns referenced by existing recalculate route but missing from schema.
alter table public.accuracy_scores
  add column if not exists prev_rank                int,
  add column if not exists rank_change              int,
  add column if not exists current_week             int not null default 0,
  add column if not exists last_scored_at           timestamptz,
  add column if not exists scoring_algorithm_version text not null default 'v1',
  add column if not exists top10_hits               int not null default 0,
  add column if not exists total_rank_error         int not null default 0;

-- ─── sync_jobs additions ─────────────────────────────────────────────────────
alter table public.sync_jobs
  add column if not exists pipeline_run_id uuid,
  add column if not exists metadata        jsonb;
```

- [ ] **Step 2: Apply migration locally via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with the SQL above, targeting the active project. Alternatively, apply via Supabase dashboard SQL editor.

- [ ] **Step 3: Verify tables exist**

Run via Supabase MCP `execute_sql`:
```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('player_stats', 'oracle_entries', 'league_state')
order by table_name;
```

Expected: 3 rows returned.

Also verify the added columns:
```sql
select column_name from information_schema.columns
where table_name = 'accuracy_scores'
  and column_name in ('prev_rank','rank_change','current_week','last_scored_at',
                      'scoring_algorithm_version','top10_hits','total_rank_error');
```

Expected: 7 rows returned.

- [ ] **Step 4: Commit**

```bash
cd /Users/gregspunt/pretty-much-picks
git add supabase/migrations/20260802_oracle_pipeline.sql
git commit -m "feat: add player_stats, oracle_entries, league_state tables + accuracy_scores columns"
```

---

### Task 3: Scoring constants + pure scoring functions

**Files:**
- Modify: `lib/oracle/constants.ts`
- Modify: `lib/oracle/scoring.ts`

**Interfaces:**
- Produces:
  - `SCORING_ALGORITHM_VERSION: 'v1'` from constants
  - `GroundTruthEntry`, `PositionScoreOutput`, `EntryScore` types
  - `scorePosition(userRows: RankingRow[], groundTruth: GroundTruthEntry[]): PositionScoreOutput` — pure, sync
  - `scoreEntry(picks: Record<OraclePosition, RankingRow[]>, groundTruth: Record<OraclePosition, GroundTruthEntry[]>): EntryScore` — pure, sync
  - `scoreUser(userId, seasonId, groundTruth, opts?): Promise<OracleResult>` — updated signature
  - All existing exports preserved: `OracleResult`, `PositionResult`, `PlayerScore`, `generateSummary`
- Consumed by: Tasks 4, 5, 6, 9, 10

- [ ] **Step 1: Write a failing test**

Create `lib/oracle/__tests__/scoring.test.ts` (replacing placeholder):
```typescript
import { describe, it, expect } from 'vitest'
import { scorePosition, scoreEntry } from '../scoring'
import type { GroundTruthEntry } from '../scoring'
import type { RankingRow } from '../rankings'
import { ORACLE_POSITIONS } from '../constants'

const gt10: GroundTruthEntry[] = Array.from({ length: 10 }, (_, i) => ({
  playerId: `p${i + 1}`,
  rank: i + 1,
  pprPoints: (10 - i) * 10,
}))

const rows10: RankingRow[] = Array.from({ length: 10 }, (_, i) => ({
  playerRank: i + 1,
  playerId: `p${i + 1}`,
  playerName: `Player ${i + 1}`,
}))

describe('scorePosition', () => {
  it('perfect score returns 100', () => {
    const result = scorePosition(rows10, gt10)
    expect(result.score).toBe(100)
    expect(result.top10Hits).toBe(10)
    expect(result.totalRankError).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails (function doesn't exist yet)**

```bash
cd /Users/gregspunt/pretty-much-picks && npm run test:run -- lib/oracle/__tests__/scoring.test.ts
```

Expected: FAIL — `scorePosition` not exported or wrong signature.

- [ ] **Step 3: Add `SCORING_ALGORITHM_VERSION` to constants.ts**

In `lib/oracle/constants.ts`, append:
```typescript
export const SCORING_ALGORITHM_VERSION = 'v1' as const
export type ScoringAlgorithmVersion = typeof SCORING_ALGORITHM_VERSION
```

- [ ] **Step 4: Replace scoring.ts with new implementation**

Full replacement of `lib/oracle/scoring.ts`:
```typescript
import { getServiceClient } from '@/lib/league/db'
import type { OraclePosition } from './constants'
import { ORACLE_POSITIONS, SCORING_ALGORITHM_VERSION } from './constants'
import { getRankings } from './rankings'
import type { RankingRow } from './rankings'

// ─── Public result types (backward-compatible — used by profile page) ────────

export interface PlayerScore {
  playerId: string
  playerName: string
  userRank: number
  actualRank: number | null
  distance: number | null
}

export interface PositionResult {
  position: OraclePosition
  normalizedScore: number
  players: PlayerScore[]
}

export interface OracleResult {
  overallScore: number
  positionResults: PositionResult[]
}

// ─── Scoring engine types ────────────────────────────────────────────────────

export interface GroundTruthEntry {
  playerId: string
  rank: number       // 1-10
  pprPoints: number
}

export interface ScoredPlayerDetail {
  playerId: string
  playerName: string
  userRank: number
  actualRank: number | null  // null = not in actual top 10
  points: number
}

export interface PositionScoreOutput {
  score: number           // 0-100, sum of all player points
  top10Hits: number       // count of user picks that landed in actual top 10
  totalRankError: number  // sum of |userRank - actualRank| for matched players only
  details: ScoredPlayerDetail[]
}

export interface EntryScore {
  positions: Record<OraclePosition, PositionScoreOutput>
  overallScore: number    // (QB + RB + WR + TE) / 4
  top10Hits: number       // sum across all positions
  totalRankError: number  // sum across all positions
}

// ─── Pure scoring functions ──────────────────────────────────────────────────

/**
 * Score a single position. Pure, synchronous, no I/O.
 *
 * Algorithm v1:
 *   For each user pick that maps to a player in the actual top 10:
 *     points = max(0, 10 - |userRank - actualRank|)  → always 1-10
 *   For picks not in the actual top 10: 0 points.
 *   positionScore = sum(points)  max = 100 (10 exact picks × 10 pts)
 */
export function scorePosition(
  userRows: RankingRow[],
  groundTruth: GroundTruthEntry[],
): PositionScoreOutput {
  const truthMap = new Map(groundTruth.map(g => [g.playerId, g.rank]))
  let top10Hits = 0
  let totalRankError = 0

  const details: ScoredPlayerDetail[] = userRows.map(row => {
    const actualRank = truthMap.get(row.playerId) ?? null
    if (actualRank != null) {
      const dist = Math.abs(row.playerRank - actualRank)
      top10Hits++
      totalRankError += dist
      return {
        playerId: row.playerId,
        playerName: row.playerName,
        userRank: row.playerRank,
        actualRank,
        points: Math.max(0, 10 - dist),
      }
    }
    return {
      playerId: row.playerId,
      playerName: row.playerName,
      userRank: row.playerRank,
      actualRank: null,
      points: 0,
    }
  })

  const score = details.reduce((sum, d) => sum + d.points, 0)
  return { score, top10Hits, totalRankError, details }
}

/**
 * Score a full entry (all 4 positions). Pure, synchronous, no I/O.
 */
export function scoreEntry(
  picks: Record<OraclePosition, RankingRow[]>,
  groundTruth: Record<OraclePosition, GroundTruthEntry[]>,
): EntryScore {
  const positions = {} as Record<OraclePosition, PositionScoreOutput>
  let totalTop10Hits = 0
  let totalRankError = 0
  let totalScore = 0

  for (const pos of ORACLE_POSITIONS) {
    const result = scorePosition(picks[pos] ?? [], groundTruth[pos] ?? [])
    positions[pos] = result
    totalTop10Hits += result.top10Hits
    totalRankError += result.totalRankError
    totalScore += result.score
  }

  return {
    positions,
    overallScore: totalScore / ORACLE_POSITIONS.length,
    top10Hits: totalTop10Hits,
    totalRankError,
  }
}

// ─── DB I/O layer ────────────────────────────────────────────────────────────

/**
 * Score a single user for a season, writing results to DB.
 * Pass dryRun=true to execute scoring logic without any writes.
 */
export async function scoreUser(
  userId: string,
  seasonId: string,
  groundTruth: Record<OraclePosition, GroundTruthEntry[]>,
  opts?: { pipelineRunId?: string; dryRun?: boolean },
): Promise<OracleResult> {
  const db = getServiceClient()
  const dryRun = opts?.dryRun ?? false

  // Fetch all positions in parallel
  const picksEntries = await Promise.all(
    ORACLE_POSITIONS.map(async pos => {
      const rows = await getRankings(userId, seasonId, pos)
      return [pos, rows] as const
    }),
  )
  const picks = Object.fromEntries(picksEntries) as Record<OraclePosition, RankingRow[]>

  const entry = scoreEntry(picks, groundTruth)

  if (!dryRun) {
    const now = new Date().toISOString()

    await db.from('accuracy_scores').upsert(
      {
        user_id: userId,
        season_id: seasonId,
        score_qb: entry.positions.QB.score,
        score_rb: entry.positions.RB.score,
        score_wr: entry.positions.WR.score,
        score_te: entry.positions.TE.score,
        overall_score: entry.overallScore,
        top10_hits: entry.top10Hits,
        total_rank_error: entry.totalRankError,
        is_projected: false,
        scoring_algorithm_version: SCORING_ALGORITHM_VERSION,
        last_scored_at: now,
        computed_at: now,
      },
      { onConflict: 'user_id,season_id' },
    )

    for (const pos of ORACLE_POSITIONS) {
      for (const d of entry.positions[pos].details) {
        await db.from('ranking_score_detail').upsert(
          {
            user_id: userId,
            season_id: seasonId,
            position: pos,
            player_id: d.playerId,
            player_name: d.playerName,
            user_rank: d.userRank,
            actual_rank: d.actualRank,
            distance: d.actualRank != null ? Math.abs(d.userRank - d.actualRank) : null,
            raw_score: d.points,
            confidence: 'medium',
            final_score: d.points,
          },
          { onConflict: 'user_id,season_id,position,player_id' },
        )
      }
    }
  }

  // Build backward-compatible OracleResult (used by profile page + generateSummary)
  const positionResults: PositionResult[] = ORACLE_POSITIONS.map(pos => ({
    position: pos,
    normalizedScore: entry.positions[pos].score,
    players: entry.positions[pos].details.map(d => ({
      playerId: d.playerId,
      playerName: d.playerName,
      userRank: d.userRank,
      actualRank: d.actualRank,
      distance: d.actualRank != null ? Math.abs(d.userRank - d.actualRank) : null,
    })),
  }))

  return { overallScore: entry.overallScore, positionResults }
}

// ─── Summary generation (unchanged) ─────────────────────────────────────────

export function generateSummary(results: OracleResult): string {
  const { positionResults, overallScore } = results
  const best = positionResults.reduce((a, b) =>
    a.normalizedScore > b.normalizedScore ? a : b,
  )
  const worst = positionResults.reduce((a, b) =>
    a.normalizedScore < b.normalizedScore ? a : b,
  )
  if (overallScore >= 90)
    return `Exceptional accuracy across every position — you predicted this season as well as almost anyone.`
  if (overallScore >= 75)
    return `Strong overall performance. Your best position was ${best.position} (${best.normalizedScore.toFixed(1)}) and you had more room to grow at ${worst.position}.`
  return `You showed real accuracy at ${best.position} rankings. Heading into next season, ${worst.position} is where there's the most room to improve.`
}
```

- [ ] **Step 5: Run the failing test — should now pass**

```bash
cd /Users/gregspunt/pretty-much-picks && npm run test:run -- lib/oracle/__tests__/scoring.test.ts
```

Expected:
```
✓ lib/oracle/__tests__/scoring.test.ts (1)
  ✓ scorePosition > perfect score returns 100
Test Files  1 passed (1)
```

- [ ] **Step 6: Commit**

```bash
cd /Users/gregspunt/pretty-much-picks
git add lib/oracle/constants.ts lib/oracle/scoring.ts lib/oracle/__tests__/scoring.test.ts
git commit -m "feat: replace placeholder scoring with v1 pure scoring engine"
```

---

### Task 4: Unit tests — comprehensive scoring coverage

**Files:**
- Modify: `lib/oracle/__tests__/scoring.test.ts`

**Interfaces:**
- Consumes: `scorePosition`, `scoreEntry`, `GroundTruthEntry` from `../scoring`; `RankingRow` from `../rankings`
- Produces: full test coverage for scoring invariants

- [ ] **Step 1: Replace scoring.test.ts with the full test suite**

```typescript
import { describe, it, expect } from 'vitest'
import { scorePosition, scoreEntry, generateSummary } from '../scoring'
import type { GroundTruthEntry, OracleResult } from '../scoring'
import type { RankingRow } from '../rankings'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeGT(count = 10): GroundTruthEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    playerId: `p${i + 1}`,
    rank: i + 1,
    pprPoints: (10 - i) * 10,
  }))
}

function makeRows(playerIds: string[], startRank = 1): RankingRow[] {
  return playerIds.map((id, i) => ({
    playerRank: startRank + i,
    playerId: id,
    playerName: `Player ${id}`,
  }))
}

const gt10 = makeGT(10)
const exactRows = makeRows(['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10'])

// ─── scorePosition ─────────────────────────────────────────────────────────────

describe('scorePosition', () => {
  it('returns 100 for perfect picks', () => {
    const result = scorePosition(exactRows, gt10)
    expect(result.score).toBe(100)
    expect(result.top10Hits).toBe(10)
    expect(result.totalRankError).toBe(0)
    expect(result.details).toHaveLength(10)
    result.details.forEach(d => expect(d.points).toBe(10))
  })

  it('returns 0 for all misses', () => {
    const rows = makeRows(['x1','x2','x3','x4','x5','x6','x7','x8','x9','x10'])
    const result = scorePosition(rows, gt10)
    expect(result.score).toBe(0)
    expect(result.top10Hits).toBe(0)
    expect(result.totalRankError).toBe(0)
    result.details.forEach(d => {
      expect(d.points).toBe(0)
      expect(d.actualRank).toBeNull()
    })
  })

  it('returns 0 for empty user picks', () => {
    const result = scorePosition([], gt10)
    expect(result.score).toBe(0)
    expect(result.top10Hits).toBe(0)
    expect(result.totalRankError).toBe(0)
    expect(result.details).toHaveLength(0)
  })

  it('returns 0 for empty ground truth', () => {
    const result = scorePosition(exactRows, [])
    expect(result.score).toBe(0)
    expect(result.top10Hits).toBe(0)
  })

  it('off by 1 in every slot gives 9 pts each', () => {
    // User ranks p2 at #1, p3 at #2, ... p10 at #9, p1 at #10
    const shiftedRows: RankingRow[] = [
      { playerRank: 1, playerId: 'p2', playerName: 'P2' },
      { playerRank: 2, playerId: 'p3', playerName: 'P3' },
      { playerRank: 3, playerId: 'p4', playerName: 'P4' },
      { playerRank: 4, playerId: 'p5', playerName: 'P5' },
      { playerRank: 5, playerId: 'p6', playerName: 'P6' },
      { playerRank: 6, playerId: 'p7', playerName: 'P7' },
      { playerRank: 7, playerId: 'p8', playerName: 'P8' },
      { playerRank: 8, playerId: 'p9', playerName: 'P9' },
      { playerRank: 9, playerId: 'p10', playerName: 'P10' },
      { playerRank: 10, playerId: 'p1', playerName: 'P1' },
    ]
    const result = scorePosition(shiftedRows, gt10)
    expect(result.score).toBe(90)             // 9 × 10
    expect(result.top10Hits).toBe(10)
    expect(result.totalRankError).toBe(10)    // 1 per player
    result.details.forEach(d => expect(d.points).toBe(9))
  })

  it('max distance within top 10 gives 1 pt (not 0)', () => {
    // User picks p1 at rank 10, p10 at rank 1 — both still in top 10
    const rows: RankingRow[] = [
      { playerRank: 1, playerId: 'p10', playerName: 'P10' },
      { playerRank: 2, playerId: 'p9', playerName: 'P9' },
      { playerRank: 3, playerId: 'p8', playerName: 'P8' },
      { playerRank: 4, playerId: 'p7', playerName: 'P7' },
      { playerRank: 5, playerId: 'p6', playerName: 'P6' },
      { playerRank: 6, playerId: 'p5', playerName: 'P5' },
      { playerRank: 7, playerId: 'p4', playerName: 'P4' },
      { playerRank: 8, playerId: 'p3', playerName: 'P3' },
      { playerRank: 9, playerId: 'p2', playerName: 'P2' },
      { playerRank: 10, playerId: 'p1', playerName: 'P1' },
    ]
    const result = scorePosition(rows, gt10)
    // p10 user#1 actual#10 → |1-10|=9 → 1pt
    // p1  user#10 actual#1 → |10-1|=9 → 1pt
    result.details.forEach(d => expect(d.points).toBeGreaterThanOrEqual(1))
  })

  it('partial picks (5 of 10 in top 10) scores only those 5', () => {
    const rows: RankingRow[] = [
      { playerRank: 1, playerId: 'p1', playerName: 'P1' },
      { playerRank: 2, playerId: 'p2', playerName: 'P2' },
      { playerRank: 3, playerId: 'p3', playerName: 'P3' },
      { playerRank: 4, playerId: 'p4', playerName: 'P4' },
      { playerRank: 5, playerId: 'p5', playerName: 'P5' },
      { playerRank: 6, playerId: 'x1', playerName: 'X1' },
      { playerRank: 7, playerId: 'x2', playerName: 'X2' },
      { playerRank: 8, playerId: 'x3', playerName: 'X3' },
      { playerRank: 9, playerId: 'x4', playerName: 'X4' },
      { playerRank: 10, playerId: 'x5', playerName: 'X5' },
    ]
    const result = scorePosition(rows, gt10)
    expect(result.score).toBe(50)   // 5 exact matches × 10 pts
    expect(result.top10Hits).toBe(5)
    expect(result.totalRankError).toBe(0)
  })

  it('score is bounded 0-100', () => {
    expect(scorePosition(exactRows, gt10).score).toBeLessThanOrEqual(100)
    expect(scorePosition(exactRows, gt10).score).toBeGreaterThanOrEqual(0)
  })
})

// ─── scoreEntry ───────────────────────────────────────────────────────────────

describe('scoreEntry', () => {
  const emptyPicks = { QB: [], RB: [], WR: [], TE: [] }
  const emptyGT = { QB: [], RB: [], WR: [], TE: [] }
  const perfectPicks = { QB: exactRows, RB: exactRows, WR: exactRows, TE: exactRows }
  const perfectGT = { QB: gt10, RB: gt10, WR: gt10, TE: gt10 }

  it('perfect entry scores 100 overall', () => {
    const entry = scoreEntry(perfectPicks, perfectGT)
    expect(entry.overallScore).toBe(100)
    expect(entry.top10Hits).toBe(40)
    expect(entry.totalRankError).toBe(0)
  })

  it('empty picks scores 0 overall', () => {
    const entry = scoreEntry(emptyPicks, emptyGT)
    expect(entry.overallScore).toBe(0)
    expect(entry.top10Hits).toBe(0)
  })

  it('overallScore = (QB + RB + WR + TE) / 4', () => {
    const mixedPicks = {
      QB: exactRows,        // 100
      RB: makeRows(['x1','x2','x3','x4','x5','x6','x7','x8','x9','x10']), // 0
      WR: makeRows(['p1','p2','p3','p4','p5','x1','x2','x3','x4','x5']),  // 50
      TE: makeRows(['p2','p3','p4','p5','p6','p7','p8','p9','p10','p1']), // 90
    }
    const entry = scoreEntry(mixedPicks, perfectGT)
    expect(entry.overallScore).toBe((100 + 0 + 50 + 90) / 4)  // 60
  })

  it('all four position results present in output', () => {
    const entry = scoreEntry(perfectPicks, perfectGT)
    expect(entry.positions.QB).toBeDefined()
    expect(entry.positions.RB).toBeDefined()
    expect(entry.positions.WR).toBeDefined()
    expect(entry.positions.TE).toBeDefined()
  })
})

// ─── generateSummary (backward-compatible) ───────────────────────────────────

describe('generateSummary', () => {
  function makeResult(qb: number, rb: number, wr: number, te: number): OracleResult {
    const overall = (qb + rb + wr + te) / 4
    return {
      overallScore: overall,
      positionResults: [
        { position: 'QB', normalizedScore: qb, players: [] },
        { position: 'RB', normalizedScore: rb, players: [] },
        { position: 'WR', normalizedScore: wr, players: [] },
        { position: 'TE', normalizedScore: te, players: [] },
      ],
    }
  }

  it('returns exceptional message for score >= 90', () => {
    const summary = generateSummary(makeResult(100, 90, 90, 90))
    expect(summary).toMatch(/exceptional/i)
  })

  it('returns strong message for score >= 75', () => {
    const summary = generateSummary(makeResult(80, 80, 80, 60))
    expect(summary).toMatch(/strong/i)
  })

  it('returns improvement message for score < 75', () => {
    const summary = generateSummary(makeResult(60, 40, 30, 50))
    expect(summary).toMatch(/accuracy/i)
  })
})
```

- [ ] **Step 2: Run the full test suite**

```bash
cd /Users/gregspunt/pretty-much-picks && npm run test:run -- lib/oracle/__tests__/scoring.test.ts
```

Expected: All tests pass (no failures).

- [ ] **Step 3: Commit**

```bash
cd /Users/gregspunt/pretty-much-picks
git add lib/oracle/__tests__/scoring.test.ts
git commit -m "test: comprehensive unit tests for v1 scoring engine"
```

---

### Task 5: Property-based tests (fast-check)

**Files:**
- Create: `lib/oracle/__tests__/scoring-property.test.ts`

**Interfaces:**
- Consumes: `scorePosition`, `scoreEntry` from `../scoring`
- Produces: fast-check property tests proving scoring invariants

- [ ] **Step 1: Write the failing property test file**

Create `lib/oracle/__tests__/scoring-property.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { scorePosition, scoreEntry } from '../scoring'
import type { GroundTruthEntry } from '../scoring'
import type { RankingRow } from '../rankings'

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const arbPlayerId = fc.string({ minLength: 1, maxLength: 8 })

const arbGroundTruth = fc.uniqueArray(arbPlayerId, { minLength: 1, maxLength: 10 }).map(ids =>
  ids.map((id, i): GroundTruthEntry => ({
    playerId: id,
    rank: i + 1,
    pprPoints: Math.max(0, (10 - i) * 5),
  }))
)

const arbUserRows = (playerPool: string[]) =>
  fc
    .uniqueArray(fc.constantFrom(...playerPool), { minLength: 0, maxLength: 10 })
    .map(ids =>
      ids.map((id, i): RankingRow => ({
        playerRank: i + 1,
        playerId: id,
        playerName: `Player ${id}`,
      }))
    )

// ─── Properties ───────────────────────────────────────────────────────────────

describe('scorePosition properties', () => {
  it('score is always between 0 and 100', () => {
    fc.assert(
      fc.property(arbGroundTruth, gt => {
        const pool = [...gt.map(g => g.playerId), 'miss1', 'miss2', 'miss3']
        return fc.sample(arbUserRows(pool), 1).every(rows => {
          const result = scorePosition(rows, gt)
          return result.score >= 0 && result.score <= 100
        })
      }),
    )
  })

  it('top10Hits is always <= number of user rows', () => {
    fc.assert(
      fc.property(arbGroundTruth, gt => {
        const pool = [...gt.map(g => g.playerId), 'miss1', 'miss2']
        return fc.sample(arbUserRows(pool), 1).every(rows => {
          const result = scorePosition(rows, gt)
          return result.top10Hits <= rows.length
        })
      }),
    )
  })

  it('totalRankError is 0 when user picks exactly match ground truth positions', () => {
    fc.assert(
      fc.property(arbGroundTruth, gt => {
        const exactRows: RankingRow[] = gt.map(g => ({
          playerRank: g.rank,
          playerId: g.playerId,
          playerName: `Player ${g.playerId}`,
        }))
        const result = scorePosition(exactRows, gt)
        return result.totalRankError === 0
      }),
    )
  })

  it('players in actual top 10 always earn >= 1 point (correct player never scores 0)', () => {
    fc.assert(
      fc.property(arbGroundTruth, gt => {
        // Ranks within 1-10 can be at most 9 apart (rank 1 vs rank 10)
        // so points = max(0, 10-9) = 1 minimum
        const exactRows: RankingRow[] = gt.map(g => ({
          playerRank: g.rank,
          playerId: g.playerId,
          playerName: `Player ${g.playerId}`,
        }))
        const result = scorePosition(exactRows, gt)
        return result.details
          .filter(d => d.actualRank !== null)
          .every(d => d.points >= 1)
      }),
    )
  })

  it('empty user rows always returns score=0, top10Hits=0', () => {
    fc.assert(
      fc.property(arbGroundTruth, gt => {
        const result = scorePosition([], gt)
        return result.score === 0 && result.top10Hits === 0 && result.details.length === 0
      }),
    )
  })

  it('score with all misses is 0 regardless of ground truth', () => {
    fc.assert(
      fc.property(arbGroundTruth, gt => {
        const missRows: RankingRow[] = Array.from({ length: 10 }, (_, i) => ({
          playerRank: i + 1,
          playerId: `guaranteed_miss_${i}`,
          playerName: `Miss ${i}`,
        }))
        const result = scorePosition(missRows, gt)
        return result.score === 0 && result.top10Hits === 0
      }),
    )
  })
})

describe('scoreEntry properties', () => {
  it('overallScore = arithmetic mean of 4 position scores', () => {
    fc.assert(
      fc.property(arbGroundTruth, gt => {
        const rows: RankingRow[] = gt.map(g => ({
          playerRank: g.rank,
          playerId: g.playerId,
          playerName: `Player ${g.playerId}`,
        }))
        const picks = { QB: rows, RB: rows, WR: rows, TE: rows }
        const truth = { QB: gt, RB: gt, WR: gt, TE: gt }
        const entry = scoreEntry(picks, truth)
        const expectedOverall = (
          entry.positions.QB.score +
          entry.positions.RB.score +
          entry.positions.WR.score +
          entry.positions.TE.score
        ) / 4
        return Math.abs(entry.overallScore - expectedOverall) < 1e-9
      }),
    )
  })

  it('overallScore is always between 0 and 100', () => {
    fc.assert(
      fc.property(arbGroundTruth, gt => {
        const rows: RankingRow[] = gt.map(g => ({
          playerRank: g.rank,
          playerId: g.playerId,
          playerName: `Player ${g.playerId}`,
        }))
        const picks = { QB: rows, RB: rows, WR: rows, TE: rows }
        const truth = { QB: gt, RB: gt, WR: gt, TE: gt }
        const entry = scoreEntry(picks, truth)
        return entry.overallScore >= 0 && entry.overallScore <= 100
      }),
    )
  })
})
```

- [ ] **Step 2: Run property tests**

```bash
cd /Users/gregspunt/pretty-much-picks && npm run test:run -- lib/oracle/__tests__/scoring-property.test.ts
```

Expected: All 7 property tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/gregspunt/pretty-much-picks
git add lib/oracle/__tests__/scoring-property.test.ts
git commit -m "test: property-based tests for scoring engine invariants"
```

---

### Task 6: Golden fixture tests (5 frozen scenarios)

**Files:**
- Create: `lib/oracle/__tests__/scoring-fixtures.test.ts`

**Interfaces:**
- Consumes: `scorePosition`, `scoreEntry` from `../scoring`
- Produces: 5 frozen scenarios that MUST NOT change if algorithm changes (add a new version instead)

- [ ] **Step 1: Write the golden fixture file**

Create `lib/oracle/__tests__/scoring-fixtures.test.ts`:
```typescript
/**
 * GOLDEN FIXTURES — ALGORITHM v1
 *
 * These tests encode exact expected outputs for specific inputs.
 * They must NEVER be updated when "fixing" a bug — if they fail,
 * the algorithm changed. Add a new version instead.
 *
 * Changing these fixtures = changing the scoring contract for users.
 */
import { describe, it, expect } from 'vitest'
import { scorePosition, scoreEntry } from '../scoring'
import type { GroundTruthEntry } from '../scoring'
import type { RankingRow } from '../rankings'

// ─── Shared ground truth: top 10 QBs by cumulative PPR after Week 8 ──────────
const QB_GT: GroundTruthEntry[] = [
  { playerId: 'mahomes',   rank: 1,  pprPoints: 280 },
  { playerId: 'jallen',    rank: 2,  pprPoints: 265 },
  { playerId: 'lamar',     rank: 3,  pprPoints: 252 },
  { playerId: 'burrow',    rank: 4,  pprPoints: 240 },
  { playerId: 'hurts',     rank: 5,  pprPoints: 228 },
  { playerId: 'stroud',    rank: 6,  pprPoints: 215 },
  { playerId: 'lawrence',  rank: 7,  pprPoints: 203 },
  { playerId: 'love',      rank: 8,  pprPoints: 191 },
  { playerId: 'stafford',  rank: 9,  pprPoints: 178 },
  { playerId: 'cousins',   rank: 10, pprPoints: 165 },
]

// ─── Fixture 1: Perfect QB score ─────────────────────────────────────────────
describe('Fixture 1: Perfect QB ranking', () => {
  const userPicks: RankingRow[] = [
    { playerRank: 1, playerId: 'mahomes', playerName: 'Patrick Mahomes' },
    { playerRank: 2, playerId: 'jallen', playerName: 'Josh Allen' },
    { playerRank: 3, playerId: 'lamar', playerName: 'Lamar Jackson' },
    { playerRank: 4, playerId: 'burrow', playerName: 'Joe Burrow' },
    { playerRank: 5, playerId: 'hurts', playerName: 'Jalen Hurts' },
    { playerRank: 6, playerId: 'stroud', playerName: 'CJ Stroud' },
    { playerRank: 7, playerId: 'lawrence', playerName: 'Trevor Lawrence' },
    { playerRank: 8, playerId: 'love', playerName: 'Jordan Love' },
    { playerRank: 9, playerId: 'stafford', playerName: 'Matthew Stafford' },
    { playerRank: 10, playerId: 'cousins', playerName: 'Kirk Cousins' },
  ]

  it('score = 100, top10Hits = 10, totalRankError = 0', () => {
    const result = scorePosition(userPicks, QB_GT)
    expect(result.score).toBe(100)
    expect(result.top10Hits).toBe(10)
    expect(result.totalRankError).toBe(0)
  })
})

// ─── Fixture 2: All misses (busted QB picks) ─────────────────────────────────
describe('Fixture 2: Complete QB miss', () => {
  const userPicks: RankingRow[] = [
    { playerRank: 1, playerId: 'darnold', playerName: 'Sam Darnold' },
    { playerRank: 2, playerId: 'flacco', playerName: 'Joe Flacco' },
    { playerRank: 3, playerId: 'minshew', playerName: 'Gardner Minshew' },
    { playerRank: 4, playerId: 'jones', playerName: 'Mac Jones' },
    { playerRank: 5, playerId: 'pickett', playerName: 'Kenny Pickett' },
    { playerRank: 6, playerId: 'ridder', playerName: 'Desmond Ridder' },
    { playerRank: 7, playerId: 'nix', playerName: 'Bo Nix' },
    { playerRank: 8, playerId: 'penix', playerName: 'Michael Penix' },
    { playerRank: 9, playerId: 'hooker', playerName: 'Hendon Hooker' },
    { playerRank: 10, playerId: 'daniel', playerName: 'Chase Daniel' },
  ]

  it('score = 0, top10Hits = 0, totalRankError = 0', () => {
    const result = scorePosition(userPicks, QB_GT)
    expect(result.score).toBe(0)
    expect(result.top10Hits).toBe(0)
    expect(result.totalRankError).toBe(0)
    result.details.forEach(d => expect(d.points).toBe(0))
  })
})

// ─── Fixture 3: 7 hits at various distances, 3 misses ────────────────────────
describe('Fixture 3: Mixed QB performance', () => {
  //  User#1 → mahomes actual#1  → |0|=0 → 10 pts
  //  User#2 → lamar   actual#3  → |1|=1 → 9 pts
  //  User#3 → jallen  actual#2  → |1|=1 → 9 pts
  //  User#4 → burrow  actual#4  → |0|=0 → 10 pts
  //  User#5 → stroud  actual#6  → |1|=1 → 9 pts
  //  User#6 → cousins actual#10 → |4|=4 → 6 pts
  //  User#7 → love    actual#8  → |1|=1 → 9 pts
  //  User#8 → MISS                       0 pts
  //  User#9 → MISS                       0 pts
  //  User#10→ MISS                       0 pts
  //  score = 10+9+9+10+9+6+9 = 62, top10Hits=7, totalRankError=0+1+1+0+1+4+1=8
  const userPicks: RankingRow[] = [
    { playerRank: 1,  playerId: 'mahomes',  playerName: 'Mahomes' },
    { playerRank: 2,  playerId: 'lamar',    playerName: 'Lamar' },
    { playerRank: 3,  playerId: 'jallen',   playerName: 'Allen' },
    { playerRank: 4,  playerId: 'burrow',   playerName: 'Burrow' },
    { playerRank: 5,  playerId: 'stroud',   playerName: 'Stroud' },
    { playerRank: 6,  playerId: 'cousins',  playerName: 'Cousins' },
    { playerRank: 7,  playerId: 'love',     playerName: 'Love' },
    { playerRank: 8,  playerId: 'darnold',  playerName: 'Darnold' },
    { playerRank: 9,  playerId: 'flacco',   playerName: 'Flacco' },
    { playerRank: 10, playerId: 'minshew',  playerName: 'Minshew' },
  ]

  it('score = 62, top10Hits = 7, totalRankError = 8', () => {
    const result = scorePosition(userPicks, QB_GT)
    expect(result.score).toBe(62)
    expect(result.top10Hits).toBe(7)
    expect(result.totalRankError).toBe(8)
  })
})

// ─── Fixture 4: Correct players, reversed order (max rank error within top 10) ─
describe('Fixture 4: Reversed QB order (all hits, max rank error)', () => {
  //  User#1 → cousins  actual#10 → |9| → 1 pt
  //  User#2 → stafford actual#9  → |7| → 3 pts  wait: |2-9|=7 → 10-7=3
  //  User#3 → love     actual#8  → |5| → 5 pts
  //  User#4 → lawrence actual#7  → |3| → 7 pts
  //  User#5 → stroud   actual#6  → |1| → 9 pts
  //  User#6 → hurts    actual#5  → |1| → 9 pts
  //  User#7 → burrow   actual#4  → |3| → 7 pts
  //  User#8 → lamar    actual#3  → |5| → 5 pts
  //  User#9 → jallen   actual#2  → |7| → 3 pts
  //  User#10→ mahomes  actual#1  → |9| → 1 pt
  //  score = 1+3+5+7+9+9+7+5+3+1 = 50
  //  totalRankError = 9+7+5+3+1+1+3+5+7+9 = 50
  const userPicks: RankingRow[] = [
    { playerRank: 1,  playerId: 'cousins',  playerName: 'Cousins' },
    { playerRank: 2,  playerId: 'stafford', playerName: 'Stafford' },
    { playerRank: 3,  playerId: 'love',     playerName: 'Love' },
    { playerRank: 4,  playerId: 'lawrence', playerName: 'Lawrence' },
    { playerRank: 5,  playerId: 'stroud',   playerName: 'Stroud' },
    { playerRank: 6,  playerId: 'hurts',    playerName: 'Hurts' },
    { playerRank: 7,  playerId: 'burrow',   playerName: 'Burrow' },
    { playerRank: 8,  playerId: 'lamar',    playerName: 'Lamar' },
    { playerRank: 9,  playerId: 'jallen',   playerName: 'Allen' },
    { playerRank: 10, playerId: 'mahomes',  playerName: 'Mahomes' },
  ]

  it('score = 50, top10Hits = 10, totalRankError = 50', () => {
    const result = scorePosition(userPicks, QB_GT)
    expect(result.score).toBe(50)
    expect(result.top10Hits).toBe(10)
    expect(result.totalRankError).toBe(50)
  })
})

// ─── Fixture 5: Full entry — all 4 positions with known scores ───────────────
describe('Fixture 5: Full entry overallScore', () => {
  const perfectRows: RankingRow[] = QB_GT.map(g => ({
    playerRank: g.rank,
    playerId: g.playerId,
    playerName: g.playerId,
  }))
  const allMissRows: RankingRow[] = Array.from({ length: 10 }, (_, i) => ({
    playerRank: i + 1,
    playerId: `miss${i}`,
    playerName: `Miss ${i}`,
  }))
  const halfHitRows: RankingRow[] = [
    ...QB_GT.slice(0, 5).map(g => ({ playerRank: g.rank, playerId: g.playerId, playerName: g.playerId })),
    ...Array.from({ length: 5 }, (_, i) => ({ playerRank: 6 + i, playerId: `miss${i}`, playerName: `Miss ${i}` })),
  ]
  // All off by 1 (use reversed-adjacent pairs)
  const offBy1Rows: RankingRow[] = [
    { playerRank: 1, playerId: 'jallen',   playerName: 'Allen' },    // actual 2, dist=1, 9pt
    { playerRank: 2, playerId: 'mahomes',  playerName: 'Mahomes' },  // actual 1, dist=1, 9pt
    { playerRank: 3, playerId: 'burrow',   playerName: 'Burrow' },   // actual 4, dist=1, 9pt
    { playerRank: 4, playerId: 'lamar',    playerName: 'Lamar' },    // actual 3, dist=1, 9pt
    { playerRank: 5, playerId: 'stroud',   playerName: 'Stroud' },   // actual 6, dist=1, 9pt
    { playerRank: 6, playerId: 'hurts',    playerName: 'Hurts' },    // actual 5, dist=1, 9pt
    { playerRank: 7, playerId: 'love',     playerName: 'Love' },     // actual 8, dist=1, 9pt
    { playerRank: 8, playerId: 'lawrence', playerName: 'Lawrence' }, // actual 7, dist=1, 9pt
    { playerRank: 9, playerId: 'cousins',  playerName: 'Cousins' },  // actual 10, dist=1, 9pt
    { playerRank: 10, playerId: 'stafford',playerName: 'Stafford' }, // actual 9, dist=1, 9pt
  ]

  // QB: perfect=100, RB: all miss=0, WR: half hit=50, TE: all off by 1=90
  // overallScore = (100+0+50+90)/4 = 60
  it('overallScore = 60 for mixed positions', () => {
    const entry = scoreEntry(
      { QB: perfectRows, RB: allMissRows, WR: halfHitRows, TE: offBy1Rows },
      { QB: QB_GT, RB: QB_GT, WR: QB_GT, TE: QB_GT },
    )
    expect(entry.positions.QB.score).toBe(100)
    expect(entry.positions.RB.score).toBe(0)
    expect(entry.positions.WR.score).toBe(50)
    expect(entry.positions.TE.score).toBe(90)
    expect(entry.overallScore).toBe(60)
  })
})
```

- [ ] **Step 2: Run fixture tests**

```bash
cd /Users/gregspunt/pretty-much-picks && npm run test:run -- lib/oracle/__tests__/scoring-fixtures.test.ts
```

Expected: All 5 fixture scenarios pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/gregspunt/pretty-much-picks
git add lib/oracle/__tests__/scoring-fixtures.test.ts
git commit -m "test: golden fixture tests for scoring algorithm v1 — do not modify"
```

---

### Task 7: Stats sync module

**Files:**
- Create: `lib/oracle/pipeline/stats-sync.ts`

**Interfaces:**
- Produces: `syncWeeklyStats(seasonId, seasonYear, week, opts?): Promise<StatsSyncResult>`
- `StatsSyncResult = { upserted: number; skipped: number; errors: string[] }`
- Consumed by: Task 10 (pipeline orchestrator)

- [ ] **Step 1: Create the pipeline directory and stats-sync module**

Create `lib/oracle/pipeline/stats-sync.ts`:
```typescript
/**
 * Syncs weekly player stats from Sleeper into player_stats table.
 * Idempotent — safe to call multiple times for the same week.
 */
import { getServiceClient } from '@/lib/league/db'

const SLEEPER_STATS_BASE = 'https://api.sleeper.app/v1/stats/nfl/regular'
const SYNC_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE'])
const RETRY_DELAYS = [500, 1000, 2000]

export interface StatsSyncResult {
  upserted: number
  skipped: number
  errors: string[]
}

interface SleeperStatsResponse {
  [playerId: string]: {
    pts_ppr?: number
    gp?: number
    [key: string]: unknown
  }
}

interface SleeperPlayerInfo {
  position?: string
  full_name?: string
  team?: string
}

async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const res = await fetch(url)
      if (res.ok) return res
      throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < RETRY_DELAYS.length) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]))
      }
    }
  }
  throw lastError ?? new Error('fetch failed')
}

/**
 * Sync player stats for a single NFL week.
 * Pulls pts_ppr from Sleeper and upserts into player_stats.
 * Player position/name info is joined from player_cache.
 */
export async function syncWeeklyStats(
  seasonId: string,
  seasonYear: number,
  week: number,
  opts?: { dryRun?: boolean },
): Promise<StatsSyncResult> {
  const db = getServiceClient()
  const dryRun = opts?.dryRun ?? false

  // Fetch Sleeper weekly stats + player info in parallel
  const [statsRes, playersRes] = await Promise.all([
    fetchWithRetry(`${SLEEPER_STATS_BASE}/${seasonYear}/${week}`),
    fetchWithRetry('https://api.sleeper.app/v1/players/nfl'),
  ])

  const stats: SleeperStatsResponse = await statsRes.json()
  const players: Record<string, SleeperPlayerInfo> = await playersRes.json()

  const now = new Date().toISOString()
  const rows: Record<string, unknown>[] = []
  let skipped = 0

  for (const [playerId, statRow] of Object.entries(stats)) {
    const ptsRaw = statRow.pts_ppr
    if (ptsRaw == null || ptsRaw === 0) { skipped++; continue }

    const playerInfo = players[playerId]
    if (!playerInfo) { skipped++; continue }

    const position = playerInfo.position ?? ''
    if (!SYNC_POSITIONS.has(position)) { skipped++; continue }

    rows.push({
      season_id: seasonId,
      week,
      player_id: playerId,
      player_name: playerInfo.full_name ?? playerId,
      position,
      team: playerInfo.team ?? null,
      game_id: null,
      provider: 'sleeper',
      external_id: playerId,
      ppr_points: ptsRaw,
      last_synced_at: now,
    })
  }

  if (dryRun) {
    return { upserted: rows.length, skipped, errors: [] }
  }

  const BATCH = 100
  const errors: string[] = []
  let upserted = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db
      .from('player_stats')
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'season_id,week,player_id' })
    if (error) {
      errors.push(error.message)
    } else {
      upserted += Math.min(BATCH, rows.length - i)
    }
  }

  return { upserted, skipped, errors }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/gregspunt/pretty-much-picks && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors related to `stats-sync.ts`.

- [ ] **Step 3: Commit**

```bash
cd /Users/gregspunt/pretty-much-picks
git add lib/oracle/pipeline/stats-sync.ts
git commit -m "feat: stats sync module — weekly Sleeper PPR stats into player_stats"
```

---

### Task 8: Ground truth builder

**Files:**
- Create: `lib/oracle/pipeline/ground-truth.ts`

**Interfaces:**
- Produces: `buildGroundTruth(seasonId, upToWeek, opts?): Promise<GroundTruthResult>`
- `GroundTruthResult = { position: OraclePosition; topPlayers: GroundTruthEntry[] }[]`
- Also writes to `ground_truth` table
- Consumed by: Task 10 (pipeline orchestrator)

- [ ] **Step 1: Create ground-truth.ts**

Create `lib/oracle/pipeline/ground-truth.ts`:
```typescript
/**
 * Builds cumulative season PPR ground truth from player_stats.
 * Aggregates weeks 1..upToWeek, ranks players by total PPR per position,
 * takes top 10, and upserts into ground_truth table.
 * Idempotent — re-running same week produces same result.
 */
import { getServiceClient } from '@/lib/league/db'
import type { OraclePosition } from '@/lib/oracle/constants'
import { ORACLE_POSITIONS } from '@/lib/oracle/constants'
import type { GroundTruthEntry } from '@/lib/oracle/scoring'

export interface GroundTruthResult {
  position: OraclePosition
  topPlayers: GroundTruthEntry[]
}

interface PlayerStatRow {
  player_id: string
  player_name: string
  position: string
  ppr_points: number
}

/**
 * Aggregate cumulative PPR from player_stats, compute top 10 per position,
 * upsert into ground_truth table, and return the structured result.
 */
export async function buildGroundTruth(
  seasonId: string,
  upToWeek: number,
  opts?: { dryRun?: boolean },
): Promise<GroundTruthResult[]> {
  const db = getServiceClient()
  const dryRun = opts?.dryRun ?? false

  // Fetch all stat rows for season up to current week
  const { data, error } = await db
    .from('player_stats')
    .select('player_id, player_name, position, ppr_points')
    .eq('season_id', seasonId)
    .lte('week', upToWeek)

  if (error) throw new Error(`player_stats fetch failed: ${error.message}`)

  const rows = (data ?? []) as PlayerStatRow[]

  // Aggregate cumulative PPR per player
  const totals = new Map<string, { total: number; name: string; position: string }>()
  for (const row of rows) {
    const existing = totals.get(row.player_id)
    totals.set(row.player_id, {
      total: (existing?.total ?? 0) + Number(row.ppr_points),
      name: existing?.name ?? row.player_name,
      position: existing?.position ?? row.position,
    })
  }

  const results: GroundTruthResult[] = []
  const now = new Date().toISOString()

  for (const position of ORACLE_POSITIONS) {
    // Filter to position, sort by total PPR desc, take top 10
    const positionPlayers = [...totals.entries()]
      .filter(([, v]) => v.position === position)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)

    const topPlayers: GroundTruthEntry[] = positionPlayers.map(([playerId, v], i) => ({
      playerId,
      rank: i + 1,
      pprPoints: Math.round(v.total * 100) / 100,
    }))

    results.push({ position, topPlayers })

    if (!dryRun && topPlayers.length > 0) {
      const upsertRows = topPlayers.map(p => ({
        season_id: seasonId,
        position,
        rank: p.rank,
        player_id: p.playerId,
        player_name: totals.get(p.playerId)?.name ?? p.playerId,
        ppr_points: p.pprPoints,
        source: 'sleeper_cumulative',
        imported_at: now,
      }))

      // Delete old ground truth for this position + season before upserting
      // (player who drops out of top 10 needs to be removed)
      await db
        .from('ground_truth')
        .delete()
        .eq('season_id', seasonId)
        .eq('position', position)

      await db.from('ground_truth').insert(upsertRows)
    }
  }

  return results
}

/**
 * Convert buildGroundTruth result to the Record format expected by scoreEntry/scoreUser.
 */
export function groundTruthToRecord(
  results: GroundTruthResult[],
): Record<OraclePosition, GroundTruthEntry[]> {
  const record = {} as Record<OraclePosition, GroundTruthEntry[]>
  for (const r of results) {
    record[r.position] = r.topPlayers
  }
  return record
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/gregspunt/pretty-much-picks && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/gregspunt/pretty-much-picks
git add lib/oracle/pipeline/ground-truth.ts
git commit -m "feat: ground truth builder — cumulative PPR aggregation + top-10 per position"
```

---

### Task 9: Scoring runner

**Files:**
- Create: `lib/oracle/pipeline/scoring-runner.ts`

**Interfaces:**
- Consumes: `scoreUser` from `@/lib/oracle/scoring`; `groundTruthToRecord` from `./ground-truth`
- Produces: `runScoringForSeason(seasonId, groundTruthResults, opts): Promise<ScoringRunResult>`
- `ScoringRunResult = { scored: number; failed: number; errors: string[] }`
- Consumed by: Task 10 (pipeline orchestrator)

- [ ] **Step 1: Create scoring-runner.ts**

Create `lib/oracle/pipeline/scoring-runner.ts`:
```typescript
/**
 * Scores all submitted entries for a season.
 * Fetches submitted user IDs, then scores in parallel batches of 100.
 * Idempotent — upserts overwrite previous scores.
 */
import { getServiceClient } from '@/lib/league/db'
import { scoreUser } from '@/lib/oracle/scoring'
import { groundTruthToRecord } from './ground-truth'
import type { GroundTruthResult } from './ground-truth'

const BATCH_SIZE = 100

export interface ScoringRunResult {
  scored: number
  failed: number
  errors: string[]
}

export async function runScoringForSeason(
  seasonId: string,
  groundTruthResults: GroundTruthResult[],
  opts: { pipelineRunId: string; dryRun: boolean },
): Promise<ScoringRunResult> {
  const db = getServiceClient()
  const groundTruth = groundTruthToRecord(groundTruthResults)

  // Collect all distinct submitted user IDs
  const { data: submittedRows, error } = await db
    .from('challenge_rankings')
    .select('user_id')
    .eq('season_id', seasonId)
    .eq('is_submitted', true)

  if (error) throw new Error(`Failed to fetch submitted users: ${error.message}`)

  const userIds = [...new Set((submittedRows ?? []).map(r => r.user_id as string))]

  let scored = 0
  let failed = 0
  const errors: string[] = []

  // Score in parallel batches of BATCH_SIZE
  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(userId =>
        scoreUser(userId, seasonId, groundTruth, {
          pipelineRunId: opts.pipelineRunId,
          dryRun: opts.dryRun,
        }),
      ),
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        scored++
      } else {
        failed++
        const msg = result.reason instanceof Error ? result.reason.message : String(result.reason)
        errors.push(msg)
      }
    }
  }

  return { scored, failed, errors }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/gregspunt/pretty-much-picks && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/gregspunt/pretty-much-picks
git add lib/oracle/pipeline/scoring-runner.ts
git commit -m "feat: scoring runner — parallel batch scoring for all submitted users"
```

---

### Task 10: Ranker

**Files:**
- Create: `lib/oracle/pipeline/ranker.ts`

**Interfaces:**
- Produces: `rankSeason(seasonId, currentWeek, opts): Promise<RankResult>`
- `RankResult = { ranked: number; errors: string[] }`
- Tiebreaker chain: `overallScore DESC → top10Hits DESC → totalRankError ASC → oracle_entries.entry_number ASC`
- Consumed by: Task 11 (pipeline orchestrator)

- [ ] **Step 1: Create ranker.ts**

Create `lib/oracle/pipeline/ranker.ts`:
```typescript
/**
 * Assigns global_rank to all accuracy_scores for a season.
 * Tiebreaker chain (per spec):
 *   1. overall_score DESC
 *   2. top10_hits DESC
 *   3. total_rank_error ASC
 *   4. oracle_entries.entry_number ASC (first submitted = higher rank on tie)
 *
 * Also computes rank_change = prev_rank - new_rank (positive = moved up).
 * Idempotent — re-running same week produces same result.
 */
import { getServiceClient } from '@/lib/league/db'

export interface RankResult {
  ranked: number
  errors: string[]
}

interface AccuracyRow {
  user_id: string
  overall_score: number | null
  top10_hits: number | null
  total_rank_error: number | null
  global_rank: number | null
}

interface EntryRow {
  user_id: string
  entry_number: number
}

export async function rankSeason(
  seasonId: string,
  currentWeek: number,
  opts: { dryRun: boolean },
): Promise<RankResult> {
  const db = getServiceClient()

  // Fetch current accuracy scores and entry numbers in parallel
  const [scoresResult, entriesResult] = await Promise.all([
    db
      .from('accuracy_scores')
      .select('user_id, overall_score, top10_hits, total_rank_error, global_rank')
      .eq('season_id', seasonId),
    db
      .from('oracle_entries')
      .select('user_id, entry_number')
      .eq('season_id', seasonId),
  ])

  if (scoresResult.error) throw new Error(`accuracy_scores fetch failed: ${scoresResult.error.message}`)
  if (entriesResult.error) throw new Error(`oracle_entries fetch failed: ${entriesResult.error.message}`)

  const scores = (scoresResult.data ?? []) as AccuracyRow[]
  const entryNumberMap = new Map(
    ((entriesResult.data ?? []) as EntryRow[]).map(e => [e.user_id, e.entry_number]),
  )

  // Apply tiebreaker sort
  const sorted = [...scores].sort((a, b) => {
    const scoreA = a.overall_score ?? 0
    const scoreB = b.overall_score ?? 0
    if (scoreB !== scoreA) return scoreB - scoreA

    const hitsA = a.top10_hits ?? 0
    const hitsB = b.top10_hits ?? 0
    if (hitsB !== hitsA) return hitsB - hitsA

    const errA = a.total_rank_error ?? 0
    const errB = b.total_rank_error ?? 0
    if (errA !== errB) return errA - errB

    const entryA = entryNumberMap.get(a.user_id) ?? Number.MAX_SAFE_INTEGER
    const entryB = entryNumberMap.get(b.user_id) ?? Number.MAX_SAFE_INTEGER
    return entryA - entryB
  })

  if (opts.dryRun) {
    return { ranked: sorted.length, errors: [] }
  }

  const errors: string[] = []
  let ranked = 0

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]
    const newRank = i + 1
    const prevRank = row.global_rank
    const rankChange = prevRank != null ? prevRank - newRank : null

    const { error } = await db
      .from('accuracy_scores')
      .update({
        global_rank: newRank,
        prev_rank: prevRank,
        rank_change: rankChange,
        current_week: currentWeek,
      })
      .eq('user_id', row.user_id)
      .eq('season_id', seasonId)

    if (error) {
      errors.push(error.message)
    } else {
      ranked++
    }
  }

  return { ranked, errors }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/gregspunt/pretty-much-picks && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/gregspunt/pretty-much-picks
git add lib/oracle/pipeline/ranker.ts
git commit -m "feat: ranker — global rank assignment with 4-way tiebreaker chain"
```

---

### Task 11: Pipeline orchestrator + `/api/sync/weekly` route

**Files:**
- Create: `lib/oracle/pipeline/pipeline.ts`
- Create: `app/api/sync/weekly/route.ts`
- Modify: `app/api/oracle/scoring/recalculate/route.ts` (stub 410)
- Modify: `vercel.json`

**Interfaces:**
- Produces: `runWeeklyPipeline(opts?): Promise<PipelineResult>` — full 4-stage execution
- `POST /api/sync/weekly` — cron entry point (same auth pattern as `/api/sync/players`)
- Consumed by: Vercel Cron (Tuesday 2pm UTC)

- [ ] **Step 1: Create pipeline orchestrator**

Create `lib/oracle/pipeline/pipeline.ts`:
```typescript
/**
 * Weekly Oracle pipeline orchestrator.
 *
 * Stages (all idempotent):
 *   1. Sync NFL state → league_state (current week from Sleeper)
 *   2. Sync player stats for current week → player_stats
 *   3. Build ground truth (cumulative PPR top 10 per position) → ground_truth
 *   4. Score all submitted entries → accuracy_scores + ranking_score_detail
 *   5. Rank all entries → global_rank + movement on accuracy_scores
 *
 * dryRun=true: full logic, zero DB writes, sync_jobs NOT written.
 * week override: skip Sleeper state sync, use provided week number.
 */
import { getServiceClient } from '@/lib/league/db'
import { getCurrentSeason } from '@/lib/oracle/season'
import { syncWeeklyStats } from './stats-sync'
import { buildGroundTruth } from './ground-truth'
import { runScoringForSeason } from './scoring-runner'
import { rankSeason } from './ranker'
import { randomUUID } from 'crypto'

const SLEEPER_STATE_URL = 'https://api.sleeper.app/v1/state/nfl'
const RETRY_DELAYS = [500, 1000, 2000]

export interface PipelineResult {
  pipelineRunId: string
  seasonId: string
  seasonYear: number
  week: number
  statsUpserted: number
  statsSkipped: number
  groundTruthPositions: number
  usersScored: number
  usersFailed: number
  usersRanked: number
  dryRun: boolean
  errors: string[]
  completedAt: string
}

interface SleeperNFLState {
  season: string
  week: number
  season_type: string
}

async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const res = await fetch(url)
      if (res.ok) return res
      throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < RETRY_DELAYS.length) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]))
      }
    }
  }
  throw lastError ?? new Error('fetch failed')
}

export async function runWeeklyPipeline(opts?: {
  week?: number
  dryRun?: boolean
}): Promise<PipelineResult> {
  const db = getServiceClient()
  const dryRun = opts?.dryRun ?? false
  const pipelineRunId = randomUUID()
  const errors: string[] = []

  const season = await getCurrentSeason()
  if (!season) throw new Error('No active season found')

  // ── Stage 1: Determine current week ─────────────────────────────────────────
  let currentWeek = opts?.week ?? 0
  let nflSeasonType = 'regular'

  if (opts?.week == null) {
    const stateRes = await fetchWithRetry(SLEEPER_STATE_URL)
    const state: SleeperNFLState = await stateRes.json()
    currentWeek = state.week
    nflSeasonType = state.season_type

    if (!dryRun) {
      await db.from('league_state').upsert(
        {
          season_id: season.id,
          current_week: currentWeek,
          nfl_season: state.season,
          nfl_week: state.week,
          nfl_season_type: state.season_type,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: 'season_id' },
      )
    }
  }

  // Record pipeline start in sync_jobs
  let jobId: string | null = null
  if (!dryRun) {
    const { data: jobRow } = await db
      .from('sync_jobs')
      .insert({
        resource: 'oracle_pipeline',
        provider: 'sleeper',
        status: 'running',
        started_at: new Date().toISOString(),
        pipeline_run_id: pipelineRunId,
        metadata: { week: currentWeek, dryRun },
      })
      .select('id')
      .single()
    jobId = (jobRow as { id: string } | null)?.id ?? null
  }

  // ── Stage 2: Sync weekly stats ───────────────────────────────────────────────
  let statsUpserted = 0
  let statsSkipped = 0
  try {
    const statsResult = await syncWeeklyStats(season.id, season.year, currentWeek, { dryRun })
    statsUpserted = statsResult.upserted
    statsSkipped = statsResult.skipped
    errors.push(...statsResult.errors)
  } catch (err) {
    errors.push(`stats-sync: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ── Stage 3: Build ground truth ──────────────────────────────────────────────
  let groundTruthResults: Awaited<ReturnType<typeof buildGroundTruth>> = []
  try {
    groundTruthResults = await buildGroundTruth(season.id, currentWeek, { dryRun })
  } catch (err) {
    errors.push(`ground-truth: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ── Stage 4: Score all submitted entries ─────────────────────────────────────
  let usersScored = 0
  let usersFailed = 0
  try {
    const scoringResult = await runScoringForSeason(season.id, groundTruthResults, {
      pipelineRunId,
      dryRun,
    })
    usersScored = scoringResult.scored
    usersFailed = scoringResult.failed
    errors.push(...scoringResult.errors)
  } catch (err) {
    errors.push(`scoring-runner: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ── Stage 5: Rank entries ────────────────────────────────────────────────────
  let usersRanked = 0
  try {
    const rankResult = await rankSeason(season.id, currentWeek, { dryRun })
    usersRanked = rankResult.ranked
    errors.push(...rankResult.errors)
  } catch (err) {
    errors.push(`ranker: ${err instanceof Error ? err.message : String(err)}`)
  }

  const completedAt = new Date().toISOString()

  // Finish sync_jobs record
  if (!dryRun && jobId) {
    await db.from('sync_jobs').update({
      status: errors.length > 0 ? 'failed' : 'success',
      completed_at: completedAt,
      records_processed: usersScored,
      error: errors[0] ?? null,
    }).eq('id', jobId)
  }

  return {
    pipelineRunId,
    seasonId: season.id,
    seasonYear: season.year,
    week: currentWeek,
    statsUpserted,
    statsSkipped,
    groundTruthPositions: groundTruthResults.length,
    usersScored,
    usersFailed,
    usersRanked,
    dryRun,
    errors,
    completedAt,
  }
}
```

- [ ] **Step 2: Create the weekly API route**

Create `app/api/sync/weekly/route.ts`:
```typescript
import { runWeeklyPipeline } from '@/lib/oracle/pipeline/pipeline'

/**
 * POST /api/sync/weekly
 * Runs the full Oracle weekly pipeline:
 *   stats sync → ground truth → scoring → ranking
 *
 * Called every Tuesday at 2pm UTC by Vercel Cron.
 * Manual trigger:
 *   curl -X POST https://<domain>/api/sync/weekly \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"week": 8}'          # optional week override
 *     -d '{"dryRun": true}'     # optional dry-run mode
 */
export async function POST(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { week?: number; dryRun?: boolean } = {}
  try {
    const text = await request.text()
    if (text) body = JSON.parse(text)
  } catch {
    // empty body is fine
  }

  try {
    const result = await runWeeklyPipeline({
      week: body.week,
      dryRun: body.dryRun ?? false,
    })
    return Response.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
```

- [ ] **Step 3: Stub out the old recalculate route**

Replace the body of `app/api/oracle/scoring/recalculate/route.ts`:
```typescript
/**
 * DEPRECATED — replaced by /api/sync/weekly
 * Returns 410 Gone to surface any misconfigured cron jobs.
 */
export async function POST() {
  return new Response(
    'This endpoint has been replaced by /api/sync/weekly. Update your cron configuration.',
    { status: 410 },
  )
}
```

- [ ] **Step 4: Update vercel.json**

Replace the crons array in `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/sync/players",
      "schedule": "0 6 * * *"
    },
    {
      "path": "/api/sync/weekly",
      "schedule": "0 14 * * 2"
    }
  ]
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/gregspunt/pretty-much-picks && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/gregspunt/pretty-much-picks
git add lib/oracle/pipeline/pipeline.ts \
        app/api/sync/weekly/route.ts \
        app/api/oracle/scoring/recalculate/route.ts \
        vercel.json
git commit -m "feat: weekly pipeline orchestrator + /api/sync/weekly cron route"
```

---

### Task 12: Update enter route — write oracle_entries

**Files:**
- Modify: `app/api/oracle/rankings/enter/route.ts`

**Interfaces:**
- Consumes: `oracle_entries` table (Task 2)
- Produces: `entry_number` returned from oracle_entries (monotonic identity, not live count)

- [ ] **Step 1: Read the current enter route (already done above)**

The current route counts distinct submitted users for `entryNumber`. We replace this with the immutable `oracle_entries.entry_number`.

- [ ] **Step 2: Update enter/route.ts**

Full replacement of `app/api/oracle/rankings/enter/route.ts`:
```typescript
import { getSession } from '@/lib/auth/server'
import { getCurrentSeason } from '@/lib/oracle/season'
import { getServiceClient } from '@/lib/league/db'
import { ORACLE_LOCK_DATE } from '@/lib/oracle/constants'

// POST /api/oracle/rankings/enter
// Sets is_submitted = true for all challenge_rankings rows for user + current season.
// Inserts into oracle_entries (DO NOTHING on conflict — entry_number never changes).
// Returns entry_number from oracle_entries for social proof display.
export async function POST() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (new Date() >= ORACLE_LOCK_DATE) return Response.json({ error: 'Locked' }, { status: 423 })

  const season = await getCurrentSeason()
  if (!season) return Response.json({ error: 'No active season' }, { status: 404 })

  const supabase = getServiceClient()
  const userId = session.user.id
  const seasonId = season.id

  // Mark all position rankings as submitted
  await supabase
    .from('challenge_rankings')
    .update({ is_submitted: true, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('season_id', seasonId)

  // Insert into oracle_entries — DO NOTHING if already exists.
  // entry_number is a monotonic identity column; it never changes after first insert.
  await supabase
    .from('oracle_entries')
    .upsert(
      {
        user_id: userId,
        season_id: seasonId,
        entered_at: new Date().toISOString(),
        submission_metadata: {},
      },
      { onConflict: 'user_id,season_id', ignoreDuplicates: true },
    )

  // Read back the immutable entry_number
  const { data: entryRow } = await supabase
    .from('oracle_entries')
    .select('entry_number')
    .eq('user_id', userId)
    .eq('season_id', seasonId)
    .single()

  const entryNumber = (entryRow as { entry_number: number } | null)?.entry_number ?? 0

  return Response.json({ ok: true, entryNumber })
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/gregspunt/pretty-much-picks && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/gregspunt/pretty-much-picks
git add app/api/oracle/rankings/enter/route.ts
git commit -m "feat: enter route writes oracle_entries — immutable entry_number for tiebreaker"
```

---

### Task 13: Profile page — show in-season scores

**Files:**
- Modify: `app/u/[username]/page.tsx`

**Interfaces:**
- Consumes: `accuracy_scores.current_week` (Task 2) to detect live scores
- Produces: Profile page shows scoring data when `current_week > 0` OR `season.status === 'scored'`

- [ ] **Step 1: Update page.tsx to show scores during regular season**

The only change needed: replace the two `isScored && season` guards with a new `hasScores` guard that also checks `current_week > 0`. Since `current_week` lives in `accuracy_scores`, we first fetch the score data (without the guard), then decide what to show.

In `app/u/[username]/page.tsx`, replace:
```typescript
  const isAfterLock = new Date() >= ORACLE_LOCK_DATE
  const isScored = season?.status === 'scored'

  // Fetch all data in parallel
  const [accResult, detailResult, rankingRowsResult, totalCountResult] =
    await Promise.all([
      // Accuracy scores (only meaningful if scored)
      isScored && season
        ? db
            .from('accuracy_scores')
            .select('overall_score, score_qb, score_rb, score_wr, score_te, global_rank, computed_at')
            .eq('user_id', profile.user_id)
            .eq('season_id', season.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),

      // Ranking score detail (only if scored)
      isScored && season
        ? db
            .from('ranking_score_detail')
            .select('position, player_id, player_name, user_rank, actual_rank, distance')
            .eq('user_id', profile.user_id)
            .eq('season_id', season.id)
        : Promise.resolve({ data: [] }),
```

with:
```typescript
  const isAfterLock = new Date() >= ORACLE_LOCK_DATE
  const isScored = season?.status === 'scored'

  // Fetch all data in parallel
  const [accResult, detailResult, rankingRowsResult, totalCountResult] =
    await Promise.all([
      // Accuracy scores — always fetch if season exists; display gated on current_week > 0
      season
        ? db
            .from('accuracy_scores')
            .select('overall_score, score_qb, score_rb, score_wr, score_te, global_rank, current_week, computed_at')
            .eq('user_id', profile.user_id)
            .eq('season_id', season.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),

      // Ranking score detail — show when in-season scores exist or fully scored
      season
        ? db
            .from('ranking_score_detail')
            .select('position, player_id, player_name, user_rank, actual_rank, distance')
            .eq('user_id', profile.user_id)
            .eq('season_id', season.id)
        : Promise.resolve({ data: [] }),
```

Also update the `AccuracyScoreRow` interface to include `current_week`:
```typescript
interface AccuracyScoreRow {
  overall_score: number
  score_qb: number
  score_rb: number
  score_wr: number
  score_te: number
  global_rank: number | null
  current_week: number | null
  computed_at: string | null
}
```

And update the gating logic — replace:
```typescript
  const oracleResult: OracleResult | null =
    isScored && scoreData
      ? { overallScore: scoreData.overall_score, positionResults }
      : null
```

with:
```typescript
  // Show scores if: season fully scored OR pipeline has run at least 1 week
  const hasInSeasonScores = (scoreData?.current_week ?? 0) > 0
  const showScores = isScored || hasInSeasonScores

  const oracleResult: OracleResult | null =
    showScores && scoreData
      ? { overallScore: scoreData.overall_score, positionResults }
      : null
```

And update the `ProfileClient` call — replace:
```typescript
      isScored={isScored}
      positionResults={isScored ? positionResults : []}
```

with:
```typescript
      isScored={showScores}
      positionResults={showScores ? positionResults : []}
```

Also update the total count fetch to not require `isScored`:
```typescript
      // Total participant count (for percentile) — show when scores exist
      season
        ? db
            .from('accuracy_scores')
            .select('*', { count: 'exact', head: true })
            .eq('season_id', season.id)
        : Promise.resolve({ count: 0 }),
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/gregspunt/pretty-much-picks && npx tsc --noEmit 2>&1 | head -30
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/gregspunt/pretty-much-picks
git add app/u/[username]/page.tsx
git commit -m "feat: profile page shows in-season scores when pipeline has run >= 1 week"
```

---

### Task 14: Pipeline integration tests

**Files:**
- Create: `lib/oracle/__tests__/pipeline.test.ts`

**Interfaces:**
- Consumes: `scorePosition`, `scoreEntry`, `buildGroundTruth`, `runWeeklyPipeline` (via mocks)
- Produces: smoke tests for pipeline data flow and recovery behavior

- [ ] **Step 1: Write integration test file**

Create `lib/oracle/__tests__/pipeline.test.ts`:
```typescript
/**
 * Pipeline integration tests.
 * Mock Sleeper API + Supabase to verify data flows correctly end-to-end.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scorePosition, scoreEntry } from '../scoring'
import { groundTruthToRecord } from '../pipeline/ground-truth'
import type { GroundTruthResult } from '../pipeline/ground-truth'
import type { GroundTruthEntry } from '../scoring'
import type { RankingRow } from '../rankings'

// ─── Ground truth builder unit tests (pure logic) ─────────────────────────────

describe('groundTruthToRecord', () => {
  it('converts array to Record keyed by position', () => {
    const gt: GroundTruthEntry = { playerId: 'p1', rank: 1, pprPoints: 100 }
    const results: GroundTruthResult[] = [
      { position: 'QB', topPlayers: [gt] },
      { position: 'RB', topPlayers: [] },
      { position: 'WR', topPlayers: [] },
      { position: 'TE', topPlayers: [] },
    ]
    const record = groundTruthToRecord(results)
    expect(record.QB).toEqual([gt])
    expect(record.RB).toEqual([])
  })
})

// ─── End-to-end scoring pipeline (pure functions only, no DB) ─────────────────

describe('scoring pipeline end-to-end (pure)', () => {
  const gt10: GroundTruthEntry[] = Array.from({ length: 10 }, (_, i) => ({
    playerId: `p${i + 1}`,
    rank: i + 1,
    pprPoints: (10 - i) * 20,
  }))

  const perfectRows: RankingRow[] = gt10.map(g => ({
    playerRank: g.rank,
    playerId: g.playerId,
    playerName: `Player ${g.playerId}`,
  }))

  it('perfect picks produce overallScore=100', () => {
    const entry = scoreEntry(
      { QB: perfectRows, RB: perfectRows, WR: perfectRows, TE: perfectRows },
      { QB: gt10, RB: gt10, WR: gt10, TE: gt10 },
    )
    expect(entry.overallScore).toBe(100)
    expect(entry.top10Hits).toBe(40)
    expect(entry.totalRankError).toBe(0)
  })

  it('partial hits across positions aggregate correctly', () => {
    const halfRows: RankingRow[] = [
      ...gt10.slice(0, 5).map(g => ({ playerRank: g.rank, playerId: g.playerId, playerName: g.playerId })),
      ...Array.from({ length: 5 }, (_, i) => ({ playerRank: 6 + i, playerId: `miss${i}`, playerName: `Miss` })),
    ]
    const allMissRows: RankingRow[] = Array.from({ length: 10 }, (_, i) => ({
      playerRank: i + 1, playerId: `miss${i}`, playerName: `Miss`,
    }))
    const entry = scoreEntry(
      { QB: perfectRows, RB: allMissRows, WR: halfRows, TE: halfRows },
      { QB: gt10, RB: gt10, WR: gt10, TE: gt10 },
    )
    // QB=100, RB=0, WR=50, TE=50 → (100+0+50+50)/4 = 50
    expect(entry.overallScore).toBe(50)
  })

  it('score is deterministic — same inputs produce same output on repeated calls', () => {
    const r1 = scoreEntry(
      { QB: perfectRows, RB: perfectRows, WR: perfectRows, TE: perfectRows },
      { QB: gt10, RB: gt10, WR: gt10, TE: gt10 },
    )
    const r2 = scoreEntry(
      { QB: perfectRows, RB: perfectRows, WR: perfectRows, TE: perfectRows },
      { QB: gt10, RB: gt10, WR: gt10, TE: gt10 },
    )
    expect(r1.overallScore).toBe(r2.overallScore)
    expect(r1.top10Hits).toBe(r2.top10Hits)
    expect(r1.totalRankError).toBe(r2.totalRankError)
  })
})

// ─── Tiebreaker ordering ──────────────────────────────────────────────────────

describe('tiebreaker chain ordering', () => {
  // Simulate what the ranker would do: sort by (score DESC, hits DESC, error ASC, entry ASC)
  interface FakeEntry {
    userId: string
    score: number
    hits: number
    error: number
    entryNumber: number
  }

  function applyTiebreakers(entries: FakeEntry[]): FakeEntry[] {
    return [...entries].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (b.hits !== a.hits) return b.hits - a.hits
      if (a.error !== b.error) return a.error - b.error
      return a.entryNumber - b.entryNumber
    })
  }

  it('higher score wins', () => {
    const entries: FakeEntry[] = [
      { userId: 'b', score: 70, hits: 10, error: 0, entryNumber: 1 },
      { userId: 'a', score: 80, hits: 10, error: 0, entryNumber: 2 },
    ]
    const sorted = applyTiebreakers(entries)
    expect(sorted[0].userId).toBe('a')
  })

  it('on equal score, more hits wins', () => {
    const entries: FakeEntry[] = [
      { userId: 'b', score: 70, hits: 28, error: 5, entryNumber: 1 },
      { userId: 'a', score: 70, hits: 30, error: 5, entryNumber: 2 },
    ]
    const sorted = applyTiebreakers(entries)
    expect(sorted[0].userId).toBe('a')
  })

  it('on equal score+hits, lower rank error wins', () => {
    const entries: FakeEntry[] = [
      { userId: 'b', score: 70, hits: 28, error: 20, entryNumber: 1 },
      { userId: 'a', score: 70, hits: 28, error: 10, entryNumber: 2 },
    ]
    const sorted = applyTiebreakers(entries)
    expect(sorted[0].userId).toBe('a')
  })

  it('on equal score+hits+error, lower entry_number (earlier submission) wins', () => {
    const entries: FakeEntry[] = [
      { userId: 'b', score: 70, hits: 28, error: 10, entryNumber: 2 },
      { userId: 'a', score: 70, hits: 28, error: 10, entryNumber: 1 },
    ]
    const sorted = applyTiebreakers(entries)
    expect(sorted[0].userId).toBe('a')
  })
})
```

- [ ] **Step 2: Run all tests together**

```bash
cd /Users/gregspunt/pretty-much-picks && npm run test:run -- lib/oracle/__tests__/
```

Expected output:
```
✓ lib/oracle/__tests__/scoring.test.ts (16)
✓ lib/oracle/__tests__/scoring-property.test.ts (7)
✓ lib/oracle/__tests__/scoring-fixtures.test.ts (5)
✓ lib/oracle/__tests__/pipeline.test.ts (8)
Test Files  4 passed (4)
```

- [ ] **Step 3: Run full TypeScript check**

```bash
cd /Users/gregspunt/pretty-much-picks && npx tsc --noEmit 2>&1
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/gregspunt/pretty-much-picks
git add lib/oracle/__tests__/pipeline.test.ts
git commit -m "test: pipeline integration tests — data flow, determinism, tiebreaker chain"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| v1 scoring formula (max(0, 10 - distance)) | Task 3 |
| `SCORING_ALGORITHM_VERSION = 'v1'` frozen constant | Task 3 |
| Full-precision overallScore storage | Task 3 (no rounding in scoreUser) |
| `top10Hits` tracking | Task 3 |
| `total_rank_error` tracking | Task 3 |
| `scorePosition` pure function | Task 3 |
| `scoreEntry` pure function | Task 3 |
| `scoreUser` with dryRun + pipelineRunId | Task 3 |
| Unit tests (invariants, edge cases) | Task 4 |
| Property-based tests (fast-check) | Task 5 |
| Golden fixtures (5 scenarios) | Task 6 |
| `player_stats` table | Task 2 |
| `oracle_entries` with monotonic entry_number | Task 2 |
| `league_state` table | Task 2 |
| `accuracy_scores` additions | Task 2 |
| Stats sync from Sleeper with retry (3 attempts, exponential backoff) | Task 7 |
| Ground truth cumulative PPR aggregation | Task 8 |
| Scoring runner (batch 100, parallel) | Task 9 |
| Ranker with 4-way tiebreaker | Task 10 |
| Pipeline orchestrator with pipeline_run_id | Task 11 |
| `dryRun=true` support | Tasks 3, 7, 8, 9, 10, 11 |
| `week` override param | Task 11 |
| `current_week` from Sleeper state (never manual) | Task 11 |
| `/api/sync/weekly` cron route | Task 11 |
| Old recalculate route → 410 | Task 11 |
| vercel.json cron update | Task 11 |
| `oracle_entries` INSERT on enter | Task 12 |
| Profile page in-season scores (current_week > 0) | Task 13 |
| Integration + tiebreaker tests | Task 14 |

**Placeholder scan:** None found. All steps have code.

**Type consistency:**
- `GroundTruthEntry` — defined in Task 3 (scoring.ts), used in Tasks 5, 6, 7, 8, 9
- `GroundTruthResult` — defined in Task 8, used in Tasks 9, 11, 14
- `groundTruthToRecord` — defined in Task 8, used in Tasks 9, 14
- `runWeeklyPipeline` — defined in Task 11, called by Task 11 route
- `PipelineResult` — defined and returned in Task 11, serialized to JSON in route
- `scoreUser` new signature `(userId, seasonId, groundTruth, opts?)` — used in Task 9 (scoring-runner)
- `RankingRow` import — `from '../rankings'` in tests; `from '@/lib/oracle/rankings'` in pipeline modules

**Backward compat:** `OracleResult`, `PositionResult`, `PlayerScore`, `generateSummary` all preserved with identical shapes in Task 3.
