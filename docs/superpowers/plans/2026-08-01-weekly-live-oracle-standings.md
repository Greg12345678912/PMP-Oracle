# Weekly Live Oracle Standings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Oracle into a season-long weekly competition — every Tuesday the leaderboard updates after an admin approves Sleeper-fetched player standings, and users see live rank, percentile, movement, and narrative on their dashboard.

**Architecture:** A Vercel Cron job fires every Tuesday to fetch cumulative PPR stats from the Sleeper API and store a pending weekly snapshot. An admin approves it, triggering a scoring pipeline that inserts immutable `oracle_weekly_scores` rows and atomically swaps the leaderboard. UI surfaces (dashboard, leaderboard, profile, player pages) all read from that single table.

**Tech Stack:** Next.js 16 App Router, Supabase (service role client for all writes), Sleeper API (public, no auth), vitest, Vercel Cron (`vercel.json`)

## Global Constraints

- All DB writes use `getServiceClient()` from `@/lib/league/db` (service role, bypasses RLS)
- All new tables follow the existing snake_case column naming pattern
- `oracle_weekly_scores` is insert-only — never updated after creation
- `oracle_weekly_standings` rows are never deleted — re-imports create new `version` rows
- Status progression for standings: `importing → pending → approved` (or `rejected`)
- Leaderboard reads the highest-version approved row for the current live week
- `scoring_version = 1` for this implementation; increment if scoring formula changes
- NFL 2026 reference date: `ORACLE_LOCK_DATE` (Sept 9, 2026) used to derive current week
- Test command: `npx vitest run <test-file-path>`
- Sleeper stats URL: `https://api.sleeper.app/v1/stats/nfl/regular/2026/{week}` (returns `{ [player_id]: { pts_ppr: number | null } }`)
- Sleeper players URL: `https://api.sleeper.app/v1/players/nfl` (returns `{ [player_id]: { position, full_name, ... } }`)
- Cron secret: `process.env.CRON_SECRET` — trigger endpoint validates `Authorization: Bearer <secret>` header

---

## File Map

**New files:**
- `supabase/migrations/20260801_oracle_weekly_standings.sql` — weekly standings table + RLS
- `supabase/migrations/20260801_oracle_weekly_scores.sql` — weekly scores table + RLS
- `lib/oracle/weeklyScoring.ts` — scoring engine for weekly data
- `lib/oracle/sleeperStats.ts` — Sleeper stats fetch + positional ranking
- `lib/oracle/__tests__/weeklyScoring.test.ts` — unit tests for weekly scoring
- `app/api/admin/oracle/weekly-import/trigger/route.ts` — Vercel Cron entry point
- `app/api/admin/oracle/weeks/[week]/approve/route.ts` — approval pipeline
- `app/api/admin/oracle/weeks/[week]/reject/route.ts` — rejection
- `app/api/admin/oracle/weeks/[week]/reimport/route.ts` — delete pending + re-trigger
- `app/api/oracle/standing/current/route.ts` — current user's live week score
- `app/admin/oracle/weeks/page.tsx` — admin weeks list
- `app/admin/oracle/weeks/[week]/page.tsx` — week mission control
- `components/oracle/WeeklyStandingCard.tsx` — live standing card (client component)
- `vercel.json` — cron schedule

**Modified files:**
- `app/challenge/page.tsx` — add weekly card to signed-in dashboard
- `app/challenge/leaderboard/page.tsx` — week selector, movement, badges
- `app/u/[username]/page.tsx` — fetch weekly scores for sparkline + current standing
- `app/u/[username]/client.tsx` — sparkline hero section
- `app/players/[id]/page.tsx` — current finish + community hit rate (post-lock)

---

### Task 1: DB Migrations

**Files:**
- Create: `supabase/migrations/20260801_oracle_weekly_standings.sql`
- Create: `supabase/migrations/20260801_oracle_weekly_scores.sql`

**Interfaces:**
- Produces: `oracle_weekly_standings` table, `oracle_weekly_scores` table — all subsequent tasks depend on these.

- [ ] **Step 1: Write the standings migration**

Create `supabase/migrations/20260801_oracle_weekly_standings.sql`:

```sql
create table if not exists public.oracle_weekly_standings (
  id           uuid primary key default gen_random_uuid(),
  season_id    uuid not null references public.seasons(id),
  week         int not null check (week between 1 and 18),
  version      int not null default 1,
  position     text not null check (position in ('QB','RB','WR','TE')),
  rank         int not null,
  player_id    text not null,
  player_name  text not null,
  ppr_points   numeric not null,
  status       text not null default 'importing'
               check (status in ('importing','pending','approved','rejected','publishing')),
  imported_at  timestamptz not null default now(),
  approved_at  timestamptz,
  published_at timestamptz,
  unique (season_id, week, version, position, rank)
);

alter table public.oracle_weekly_standings enable row level security;

-- Public reads: only fully approved rows
create policy "Read approved weekly standings"
  on public.oracle_weekly_standings for select
  using (status = 'approved');

-- Admins get full access via service role (bypasses RLS)
```

- [ ] **Step 2: Write the scores migration**

Create `supabase/migrations/20260801_oracle_weekly_scores.sql`:

```sql
create table if not exists public.oracle_weekly_scores (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  season_id       uuid not null references public.seasons(id),
  week            int not null check (week between 1 and 18),
  version         int not null,
  scoring_version int not null default 1,
  score_qb        numeric,
  score_rb        numeric,
  score_wr        numeric,
  score_te        numeric,
  overall_score   numeric,
  projected_rank  int,
  total_users     int,
  percentile      numeric,    -- 0–100, e.g. 3.2 = Top 3.2%
  previous_rank   int,
  rank_movement   int,        -- negative = climbed (better rank), positive = dropped
  score_delta     numeric,    -- positive = improved vs last week
  calculated_at   timestamptz not null default now(),
  unique (user_id, season_id, week, version)
);

alter table public.oracle_weekly_scores enable row level security;

-- Leaderboard + profile are public
create policy "Public read weekly scores"
  on public.oracle_weekly_scores for select
  using (true);

-- Service role handles all inserts
```

- [ ] **Step 3: Apply migrations via Supabase MCP**

Use the Supabase MCP tool `apply_migration` twice:
- First with the contents of `20260801_oracle_weekly_standings.sql`
- Then with the contents of `20260801_oracle_weekly_scores.sql`

Verify: use `list_tables` to confirm both tables appear.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260801_oracle_weekly_standings.sql \
        supabase/migrations/20260801_oracle_weekly_scores.sql
git commit -m "feat: add oracle_weekly_standings and oracle_weekly_scores tables"
```

---

### Task 2: Weekly Scoring Engine

**Files:**
- Create: `lib/oracle/weeklyScoring.ts`
- Create: `lib/oracle/__tests__/weeklyScoring.test.ts`

**Interfaces:**
- Consumes: `getRankings(userId, seasonId, position)` from `@/lib/oracle/rankings` → `RankingRow[]`
- Consumes: `scoreRankings(userRank, actualRank)` and `applyConfidence(raw, confidence)` from `@/lib/oracle/scoring`
- Consumes: `ORACLE_POSITIONS`, `POSITION_LIST_SIZE`, `ORACLE_LOCK_DATE` from `@/lib/oracle/constants`
- Consumes: `getServiceClient()` from `@/lib/league/db`
- Produces:
  - `getCurrentNFLWeek(): number | null` — derives current NFL week from ORACLE_LOCK_DATE
  - `scoreUserForWeek(userId, seasonId, week, version): Promise<WeeklyUserScore>` — scores one user vs weekly standings
  - `scoreAllUsersForWeek(seasonId, week, version): Promise<ScoringResult>` — scores everyone, assigns ranks + percentiles, inserts rows

- [ ] **Step 1: Write the failing tests**

Create `lib/oracle/__tests__/weeklyScoring.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { getCurrentNFLWeek, scoreUserForWeek } from '../weeklyScoring'
import { ORACLE_LOCK_DATE } from '../constants'

vi.mock('@/lib/league/db')
vi.mock('../rankings')

describe('getCurrentNFLWeek', () => {
  it('returns null before the season starts', () => {
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z'))
    expect(getCurrentNFLWeek()).toBeNull()
    vi.useRealTimers()
  })

  it('returns 1 on the Tuesday after week 1 (Sept 15)', () => {
    vi.setSystemTime(new Date('2026-09-15T11:00:00-04:00'))
    expect(getCurrentNFLWeek()).toBe(1)
    vi.useRealTimers()
  })

  it('returns 2 on Tuesday Sept 22', () => {
    vi.setSystemTime(new Date('2026-09-22T11:00:00-04:00'))
    expect(getCurrentNFLWeek()).toBe(2)
    vi.useRealTimers()
  })

  it('returns null after week 18 (postseason)', () => {
    vi.setSystemTime(new Date('2027-02-01T12:00:00Z'))
    expect(getCurrentNFLWeek()).toBeNull()
    vi.useRealTimers()
  })
})

describe('scoreUserForWeek', () => {
  const mockDb = {
    from: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    const { getServiceClient } = require('@/lib/league/db')
    ;(getServiceClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
  })

  it('scores a user whose QB1 pick exactly matches the weekly standing', async () => {
    const { getRankings } = require('../rankings')
    ;(getRankings as ReturnType<typeof vi.fn>).mockResolvedValue([
      { playerRank: 1, playerId: 'p1', playerName: 'Josh Allen', confidence: 'high' },
    ])

    // Mock weekly standings query: p1 is also rank 1
    const mockSelect = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      data: [{ player_id: 'p1', rank: 1 }],
    }
    mockSelect.eq.mockResolvedValue({ data: [{ player_id: 'p1', rank: 1 }] })
    mockDb.from.mockReturnValue(mockSelect)

    const result = await scoreUserForWeek('user1', 'season1', 1, 1)
    // Josh Allen exact match = 50 raw, high confidence + strong (>=30) = 50 * 1.5 = 75
    // normalized QB = (75 / (10 * 50)) * 100 = 15.0
    expect(result.qb).toBeGreaterThan(0)
    expect(result.overall).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run lib/oracle/__tests__/weeklyScoring.test.ts
```

Expected: FAIL with "Cannot find module '../weeklyScoring'"

- [ ] **Step 3: Implement `lib/oracle/weeklyScoring.ts`**

```typescript
import { getServiceClient } from '@/lib/league/db'
import { ORACLE_POSITIONS, POSITION_LIST_SIZE, ORACLE_LOCK_DATE } from './constants'
import type { OraclePosition } from './constants'
import { getRankings } from './rankings'
import { scoreRankings, applyConfidence } from './scoring'

// Increment this constant if the scoring formula ever changes.
// Stored in every oracle_weekly_scores row for audit purposes.
export const SCORING_VERSION = 1

/** Derive the current NFL week from the lock date (= season start).
 *  Returns null before the season begins or after Week 18. */
export function getCurrentNFLWeek(): number | null {
  const now = new Date()
  if (now < ORACLE_LOCK_DATE) return null
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const week = Math.floor((now.getTime() - ORACLE_LOCK_DATE.getTime()) / msPerWeek) + 1
  if (week < 1 || week > 18) return null
  return week
}

export interface WeeklyUserScore {
  qb: number
  rb: number
  wr: number
  te: number
  overall: number
}

/** Score a single user's preseason rankings against the weekly standings for one week. */
export async function scoreUserForWeek(
  userId: string,
  seasonId: string,
  week: number,
  version: number,
): Promise<WeeklyUserScore> {
  const db = getServiceClient()

  // Fetch approved weekly standings for this week+version, all 4 positions
  const { data: standingRows } = await db
    .from('oracle_weekly_standings')
    .select('position, player_id, rank')
    .eq('season_id', seasonId)
    .eq('week', week)
    .eq('version', version)
    .eq('status', 'approved')

  // Build map: position → Map<playerId, weeklyRank>
  const weeklyRankByPos = new Map<OraclePosition, Map<string, number>>()
  for (const pos of ORACLE_POSITIONS) {
    weeklyRankByPos.set(pos, new Map())
  }
  for (const row of (standingRows ?? []) as Array<{ position: string; player_id: string; rank: number }>) {
    const pos = row.position as OraclePosition
    weeklyRankByPos.get(pos)?.set(row.player_id, row.rank)
  }

  // Score each position
  const scores: Record<OraclePosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 }
  for (const pos of ORACLE_POSITIONS) {
    const userRows = await getRankings(userId, seasonId, pos)
    const truthMap = weeklyRankByPos.get(pos)!
    const maxPossible = POSITION_LIST_SIZE[pos] * 50
    let total = 0
    for (const row of userRows) {
      const actualRank = truthMap.get(row.playerId) ?? null
      const raw = scoreRankings(row.playerRank, actualRank)
      total += applyConfidence(raw, row.confidence)
    }
    scores[pos] = maxPossible > 0 ? Math.round((total / maxPossible) * 1000) / 10 : 0
  }

  const overall = Math.round(((scores.QB + scores.RB + scores.WR + scores.TE) / 4) * 10) / 10
  return { qb: scores.QB, rb: scores.RB, wr: scores.WR, te: scores.TE, overall }
}

export interface ScoringResult {
  scored: number
  calculatedAt: string
}

/** Score all submitted users for a week, assign ranks + percentiles, insert oracle_weekly_scores rows.
 *
 * Call this after setting oracle_weekly_standings status to 'publishing'.
 * When this resolves, set status to 'approved' and published_at = now().
 *
 * TODO: At ~5,000 users, chunk into batches of 500 with a queue rather than scoring sequentially.
 */
export async function scoreAllUsersForWeek(
  seasonId: string,
  week: number,
  version: number,
): Promise<ScoringResult> {
  const db = getServiceClient()

  // 1. Fetch all users who have submitted rankings this season
  const { data: submitters } = await db
    .from('challenge_rankings')
    .select('user_id')
    .eq('season_id', seasonId)
    .eq('is_submitted', true)

  const userIds = [...new Set((submitters ?? []).map((r: { user_id: string }) => r.user_id))]
  const totalUsers = userIds.length

  // 2. Preload previous week's ranks into memory (avoids N queries for movement)
  const prevRankMap = new Map<string, number>()
  if (week > 1) {
    const { data: prevRows } = await db
      .from('oracle_weekly_scores')
      .select('user_id, projected_rank, version')
      .eq('season_id', seasonId)
      .eq('week', week - 1)
      .order('version', { ascending: false })

    // Take most recent version per user
    const seen = new Set<string>()
    for (const row of (prevRows ?? []) as Array<{ user_id: string; projected_rank: number | null; version: number }>) {
      if (!seen.has(row.user_id) && row.projected_rank != null) {
        prevRankMap.set(row.user_id, row.projected_rank)
        seen.add(row.user_id)
      }
    }
  }

  // 3. Score each user
  const userScores: Array<{ userId: string; score: WeeklyUserScore }> = []
  for (const userId of userIds) {
    const score = await scoreUserForWeek(userId, seasonId, week, version)
    userScores.push({ userId, score })
  }

  // 4. Sort by overall_score descending to assign ranks
  userScores.sort((a, b) => b.score.overall - a.score.overall)

  // 5. Delete any existing rows for this week+version (idempotent re-run safety)
  await db
    .from('oracle_weekly_scores')
    .delete()
    .eq('season_id', seasonId)
    .eq('week', week)
    .eq('version', version)

  // 6. Build + insert all rows
  const calculatedAt = new Date().toISOString()
  const rows = userScores.map(({ userId, score }, i) => {
    const projectedRank = i + 1
    const percentile = totalUsers > 0
      ? Math.round(((totalUsers - projectedRank + 1) / totalUsers) * 1000) / 10
      : 0
    const previousRank = prevRankMap.get(userId) ?? null
    const rankMovement = previousRank != null ? projectedRank - previousRank : null

    return {
      user_id: userId,
      season_id: seasonId,
      week,
      version,
      scoring_version: SCORING_VERSION,
      score_qb: score.qb,
      score_rb: score.rb,
      score_wr: score.wr,
      score_te: score.te,
      overall_score: score.overall,
      projected_rank: projectedRank,
      total_users: totalUsers,
      percentile,
      previous_rank: previousRank,
      rank_movement: rankMovement,
      score_delta: null as number | null, // computed below with week N-1 overall scores
      calculated_at: calculatedAt,
    }
  })

  // Compute score_delta: overall_score vs week N-1
  if (week > 1) {
    const { data: prevScoreRows } = await db
      .from('oracle_weekly_scores')
      .select('user_id, overall_score, version')
      .eq('season_id', seasonId)
      .eq('week', week - 1)
      .order('version', { ascending: false })

    const prevOverallMap = new Map<string, number>()
    const seenPrev = new Set<string>()
    for (const row of (prevScoreRows ?? []) as Array<{ user_id: string; overall_score: number; version: number }>) {
      if (!seenPrev.has(row.user_id)) {
        prevOverallMap.set(row.user_id, row.overall_score)
        seenPrev.add(row.user_id)
      }
    }
    for (const row of rows) {
      const prev = prevOverallMap.get(row.user_id)
      if (prev != null && row.overall_score != null) {
        row.score_delta = Math.round((row.overall_score - prev) * 100) / 100
      }
    }
  }

  // Insert in chunks of 100 to avoid payload size limits
  const CHUNK = 100
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.from('oracle_weekly_scores').insert(rows.slice(i, i + CHUNK))
  }

  return { scored: rows.length, calculatedAt }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run lib/oracle/__tests__/weeklyScoring.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/oracle/weeklyScoring.ts lib/oracle/__tests__/weeklyScoring.test.ts
git commit -m "feat: add weekly Oracle scoring engine with NFL week detection"
```

---

### Task 3: Sleeper Stats Fetcher + Import Trigger

**Files:**
- Create: `lib/oracle/sleeperStats.ts`
- Create: `app/api/admin/oracle/weekly-import/trigger/route.ts`

**Interfaces:**
- Consumes: `getCurrentNFLWeek()` from `./weeklyScoring`
- Consumes: `getCurrentSeason()` from `@/lib/oracle/season`
- Consumes: `getServiceClient()` from `@/lib/league/db`
- Produces:
  - `fetchCumulativeStandings(week): Promise<PositionalStandings>` — fetches + ranks by cumulative PPR
  - `POST /api/admin/oracle/weekly-import/trigger` — used by Vercel Cron and admin manual re-trigger

- [ ] **Step 1: Implement `lib/oracle/sleeperStats.ts`**

```typescript
const SLEEPER_STATS_BASE = 'https://api.sleeper.app/v1/stats/nfl/regular/2026'
const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl'

const ORACLE_POSITIONS_SET = new Set(['QB', 'RB', 'WR', 'TE'])

interface SleeperStatRow {
  pts_ppr?: number | null
  [key: string]: unknown
}

interface SleeperPlayerMeta {
  position: string
  full_name: string
}

export interface WeeklyStandingRow {
  position: 'QB' | 'RB' | 'WR' | 'TE'
  rank: number
  player_id: string
  player_name: string
  ppr_points: number
}

export interface PositionalStandings {
  QB: WeeklyStandingRow[]
  RB: WeeklyStandingRow[]
  WR: WeeklyStandingRow[]
  TE: WeeklyStandingRow[]
}

/** Fetch all player metadata from Sleeper. Used to resolve player_id → position + name. */
async function fetchPlayerMeta(): Promise<Map<string, SleeperPlayerMeta>> {
  const res = await fetch(SLEEPER_PLAYERS_URL, { next: { revalidate: 3600 } } as RequestInit)
  if (!res.ok) throw new Error(`Sleeper players API error: ${res.status}`)
  const data: Record<string, SleeperPlayerMeta> = await res.json()
  return new Map(Object.entries(data))
}

/** Fetch stats for a single week from Sleeper. */
async function fetchWeekStats(week: number): Promise<Map<string, number>> {
  const res = await fetch(`${SLEEPER_STATS_BASE}/${week}`, {
    next: { revalidate: 0 }, // always fresh for weekly import
  } as RequestInit)
  if (!res.ok) throw new Error(`Sleeper stats API error week ${week}: ${res.status}`)
  const data: Record<string, SleeperStatRow> = await res.json()
  const pts = new Map<string, number>()
  for (const [playerId, stats] of Object.entries(data)) {
    if (typeof stats.pts_ppr === 'number' && stats.pts_ppr > 0) {
      pts.set(playerId, stats.pts_ppr)
    }
  }
  return pts
}

/** Fetch cumulative PPR standings through the given week.
 *  Fetches weeks 1..week in parallel, sums pts_ppr, ranks by position. */
export async function fetchCumulativeStandings(week: number): Promise<PositionalStandings> {
  const [playerMeta, ...weeklyStats] = await Promise.all([
    fetchPlayerMeta(),
    ...Array.from({ length: week }, (_, i) => fetchWeekStats(i + 1)),
  ])

  // Sum cumulative PPR per player
  const cumulative = new Map<string, number>()
  for (const weekPts of weeklyStats) {
    for (const [playerId, pts] of weekPts) {
      cumulative.set(playerId, (cumulative.get(playerId) ?? 0) + pts)
    }
  }

  // Group by position and sort by cumulative PPR desc
  const grouped: Record<string, Array<{ player_id: string; player_name: string; ppr_points: number }>> = {
    QB: [], RB: [], WR: [], TE: [],
  }

  for (const [playerId, totalPts] of cumulative) {
    const meta = playerMeta.get(playerId)
    if (!meta || !ORACLE_POSITIONS_SET.has(meta.position)) continue
    const pos = meta.position as 'QB' | 'RB' | 'WR' | 'TE'
    grouped[pos].push({ player_id: playerId, player_name: meta.full_name ?? playerId, ppr_points: totalPts })
  }

  const result: PositionalStandings = { QB: [], RB: [], WR: [], TE: [] }
  for (const pos of ['QB', 'RB', 'WR', 'TE'] as const) {
    result[pos] = grouped[pos]
      .sort((a, b) => b.ppr_points - a.ppr_points)
      .map((p, i) => ({ position: pos, rank: i + 1, ...p }))
  }

  return result
}
```

- [ ] **Step 2: Implement the trigger endpoint**

Create `app/api/admin/oracle/weekly-import/trigger/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/league/db'
import { getCurrentSeason } from '@/lib/oracle/season'
import { getCurrentNFLWeek } from '@/lib/oracle/weeklyScoring'
import { fetchCumulativeStandings } from '@/lib/oracle/sleeperStats'

/** Called by Vercel Cron every Tuesday at 7 AM ET.
 *  Also callable manually by admins via POST with Authorization header. */
export async function POST(request: NextRequest) {
  // Validate cron secret
  const auth = request.headers.get('Authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const week = getCurrentNFLWeek()
  if (week == null) {
    return NextResponse.json({ skipped: true, reason: 'Outside NFL season' })
  }

  const season = await getCurrentSeason()
  if (!season) {
    return NextResponse.json({ error: 'No active season' }, { status: 404 })
  }

  const db = getServiceClient()

  // Determine next version for this week
  const { data: existingRows } = await db
    .from('oracle_weekly_standings')
    .select('version')
    .eq('season_id', season.id)
    .eq('week', week)
    .order('version', { ascending: false })
    .limit(1)

  const nextVersion = existingRows && existingRows.length > 0
    ? (existingRows[0] as { version: number }).version + 1
    : 1

  // Insert initial row to mark import as in-progress
  // (one sentinel row per version so admin can see it's running)
  await db.from('oracle_weekly_standings').insert({
    season_id: season.id,
    week,
    version: nextVersion,
    position: 'QB',
    rank: 0,        // sentinel — will be replaced
    player_id: '__importing__',
    player_name: 'Importing…',
    ppr_points: 0,
    status: 'importing',
  })

  // Fetch cumulative standings from Sleeper
  let standings
  try {
    standings = await fetchCumulativeStandings(week)
  } catch (err) {
    // Mark sentinel as rejected so admin can see the failure
    await db
      .from('oracle_weekly_standings')
      .update({ status: 'rejected' })
      .eq('season_id', season.id)
      .eq('week', week)
      .eq('version', nextVersion)
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }

  // Delete sentinel row(s) for this version
  await db
    .from('oracle_weekly_standings')
    .delete()
    .eq('season_id', season.id)
    .eq('week', week)
    .eq('version', nextVersion)

  // Insert all position rows as 'pending'
  const rows = [
    ...standings.QB,
    ...standings.RB,
    ...standings.WR,
    ...standings.TE,
  ].map(r => ({
    season_id: season.id,
    week,
    version: nextVersion,
    position: r.position,
    rank: r.rank,
    player_id: r.player_id,
    player_name: r.player_name,
    ppr_points: r.ppr_points,
    status: 'pending',
  }))

  // Insert in chunks of 200
  const CHUNK = 200
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.from('oracle_weekly_standings').insert(rows.slice(i, i + CHUNK))
  }

  return NextResponse.json({ ok: true, week, version: nextVersion, rows: rows.length })
}
```

- [ ] **Step 3: Add `CRON_SECRET` to your Vercel environment variables**

In Vercel dashboard → Project Settings → Environment Variables, add:
- `CRON_SECRET` = any strong random string (e.g., generate with `openssl rand -hex 32`)

Also add it to your local `.env.local` for testing.

- [ ] **Step 4: Smoke test the endpoint manually**

```bash
curl -X POST http://localhost:3000/api/admin/oracle/weekly-import/trigger \
  -H "Authorization: Bearer <your-cron-secret>"
```

Expected (before season starts): `{ "skipped": true, "reason": "Outside NFL season" }`

- [ ] **Step 5: Commit**

```bash
git add lib/oracle/sleeperStats.ts \
        app/api/admin/oracle/weekly-import/trigger/route.ts
git commit -m "feat: Sleeper weekly stats fetcher and import trigger endpoint"
```

---

### Task 4: Admin Approval Pipeline + Current Standing API

**Files:**
- Create: `app/api/admin/oracle/weeks/[week]/approve/route.ts`
- Create: `app/api/admin/oracle/weeks/[week]/reject/route.ts`
- Create: `app/api/admin/oracle/weeks/[week]/reimport/route.ts`
- Create: `app/api/oracle/standing/current/route.ts`

**Interfaces:**
- Consumes: `scoreAllUsersForWeek(seasonId, week, version)` from `@/lib/oracle/weeklyScoring`
- Consumes: `getProfile()` from `@/lib/oracle/profile` (admin gate)
- Consumes: `getSession()` from `@/lib/auth/server`
- Produces:
  - `POST /api/admin/oracle/weeks/[week]/approve` — pipeline: pending → publishing → scoring → approved
  - `POST /api/admin/oracle/weeks/[week]/reject`
  - `POST /api/admin/oracle/weeks/[week]/reimport` — calls trigger endpoint with same auth
  - `GET /api/oracle/standing/current` — signed-in user's current week score

- [ ] **Step 1: Implement the approve route**

Create `app/api/admin/oracle/weeks/[week]/approve/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { getProfile } from '@/lib/oracle/profile'
import { getServiceClient } from '@/lib/league/db'
import { getCurrentSeason } from '@/lib/oracle/season'
import { scoreAllUsersForWeek } from '@/lib/oracle/weeklyScoring'

interface RouteContext { params: Promise<{ week: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { week: weekStr } = await params
  const week = parseInt(weekStr, 10)
  if (isNaN(week) || week < 1 || week > 18) {
    return NextResponse.json({ error: 'Invalid week' }, { status: 400 })
  }

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const profile = await getProfile(session.user.id)
  if (!profile?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const season = await getCurrentSeason()
  if (!season) return NextResponse.json({ error: 'No active season' }, { status: 404 })

  const db = getServiceClient()

  // Find the latest pending version for this week
  const { data: pendingRows } = await db
    .from('oracle_weekly_standings')
    .select('version')
    .eq('season_id', season.id)
    .eq('week', week)
    .eq('status', 'pending')
    .order('version', { ascending: false })
    .limit(1)

  if (!pendingRows || pendingRows.length === 0) {
    return NextResponse.json({ error: 'No pending standings for this week' }, { status: 404 })
  }

  const version = (pendingRows[0] as { version: number }).version

  // Set status → publishing (leaderboard still shows previous week during scoring)
  await db
    .from('oracle_weekly_standings')
    .update({ status: 'publishing', approved_at: new Date().toISOString() })
    .eq('season_id', season.id)
    .eq('week', week)
    .eq('version', version)

  // Run the scoring pipeline
  const start = Date.now()
  const { scored } = await scoreAllUsersForWeek(season.id, week, version)
  const duration = Math.round((Date.now() - start) / 1000)

  // Mark standings as approved + set published_at (atomic swap: leaderboard now shows this week)
  const publishedAt = new Date().toISOString()
  await db
    .from('oracle_weekly_standings')
    .update({ status: 'approved', published_at: publishedAt })
    .eq('season_id', season.id)
    .eq('week', week)
    .eq('version', version)

  return NextResponse.json({
    ok: true,
    week,
    version,
    scored,
    publishedAt,
    durationSeconds: duration,
  })
}
```

- [ ] **Step 2: Implement the reject route**

Create `app/api/admin/oracle/weeks/[week]/reject/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { getProfile } from '@/lib/oracle/profile'
import { getServiceClient } from '@/lib/league/db'
import { getCurrentSeason } from '@/lib/oracle/season'

interface RouteContext { params: Promise<{ week: string }> }

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { week: weekStr } = await params
  const week = parseInt(weekStr, 10)

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const profile = await getProfile(session.user.id)
  if (!profile?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const season = await getCurrentSeason()
  if (!season) return NextResponse.json({ error: 'No active season' }, { status: 404 })

  const db = getServiceClient()
  await db
    .from('oracle_weekly_standings')
    .update({ status: 'rejected' })
    .eq('season_id', season.id)
    .eq('week', week)
    .eq('status', 'pending')

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Implement the reimport route**

Create `app/api/admin/oracle/weeks/[week]/reimport/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { getProfile } from '@/lib/oracle/profile'

interface RouteContext { params: Promise<{ week: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  await params // consume to satisfy Next.js route params contract

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const profile = await getProfile(session.user.id)
  if (!profile?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Re-use the trigger endpoint logic by calling it internally
  const triggerUrl = new URL('/api/admin/oracle/weekly-import/trigger', request.url)
  const res = await fetch(triggerUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  const json = await res.json()
  return NextResponse.json(json, { status: res.status })
}
```

- [ ] **Step 4: Implement the current standing API**

Create `app/api/oracle/standing/current/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/server'
import { getServiceClient } from '@/lib/league/db'
import { getCurrentSeason } from '@/lib/oracle/season'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ standing: null })

  const season = await getCurrentSeason()
  if (!season) return NextResponse.json({ standing: null })

  const db = getServiceClient()

  // Find the latest approved week
  const { data: latestWeek } = await db
    .from('oracle_weekly_standings')
    .select('week, version, published_at')
    .eq('season_id', season.id)
    .eq('status', 'approved')
    .order('week', { ascending: false })
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latestWeek) return NextResponse.json({ standing: null, week: null })

  const { week, version } = latestWeek as { week: number; version: number; published_at: string }

  // Get user's score for that week (latest version)
  const { data: scoreRow } = await db
    .from('oracle_weekly_scores')
    .select('overall_score, score_qb, score_rb, score_wr, score_te, projected_rank, total_users, percentile, previous_rank, rank_movement, score_delta')
    .eq('user_id', session.user.id)
    .eq('season_id', season.id)
    .eq('week', week)
    .eq('version', version)
    .maybeSingle()

  return NextResponse.json({ standing: scoreRow ?? null, week })
}
```

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/oracle/weeks/[week]/approve/route.ts \
        app/api/admin/oracle/weeks/[week]/reject/route.ts \
        app/api/admin/oracle/weeks/[week]/reimport/route.ts \
        app/api/oracle/standing/current/route.ts
git commit -m "feat: admin approval pipeline and current standing API"
```

---

### Task 5: Admin UI

**Files:**
- Create: `app/admin/oracle/weeks/page.tsx`
- Create: `app/admin/oracle/weeks/[week]/page.tsx`

**Interfaces:**
- Consumes: admin routes from Task 4
- Consumes: `getSession()` + `getProfile()` for admin gate
- Consumes: `getServiceClient()` for DB reads

- [ ] **Step 1: Implement the weeks list page**

Create `app/admin/oracle/weeks/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth/server'
import { getProfile } from '@/lib/oracle/profile'
import { getServiceClient } from '@/lib/league/db'
import { getCurrentSeason } from '@/lib/oracle/season'

export const dynamic = 'force-dynamic'

const STATUS_COLORS: Record<string, string> = {
  importing:  'bg-yellow-900 text-yellow-300',
  pending:    'bg-blue-900 text-blue-300',
  publishing: 'bg-orange-900 text-orange-300',
  approved:   'bg-green-900 text-green-300',
  rejected:   'bg-red-900 text-red-300',
}

export default async function AdminOracleWeeksPage() {
  const session = await getSession()
  if (!session) redirect('/')
  const profile = await getProfile(session.user.id)
  if (!profile?.isAdmin) redirect('/')

  const season = await getCurrentSeason()
  const db = getServiceClient()

  // Get distinct (week, version, status, imported_at) — one row per version
  const { data: rows } = season
    ? await db
        .from('oracle_weekly_standings')
        .select('week, version, status, imported_at, approved_at, published_at')
        .eq('season_id', season.id)
        .order('week', { ascending: false })
        .order('version', { ascending: false })
    : { data: [] }

  // Deduplicate to one row per (week, version)
  const seen = new Set<string>()
  const weeks = ((rows ?? []) as Array<{
    week: number; version: number; status: string; imported_at: string; approved_at: string | null; published_at: string | null
  }>).filter(r => {
    const key = `${r.week}-${r.version}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return (
    <div className="min-h-screen bg-pmp-black px-6 py-8 max-w-2xl mx-auto">
      <h1 className="text-pmp-white font-black text-2xl mb-1">Oracle Admin</h1>
      <p className="text-pmp-gray-500 text-sm mb-8">Weekly standings pipeline</p>

      {weeks.length === 0 && (
        <p className="text-pmp-gray-600 text-sm">No weekly standings imported yet.</p>
      )}

      <div className="flex flex-col gap-3">
        {weeks.map(w => (
          <Link
            key={`${w.week}-${w.version}`}
            href={`/admin/oracle/weeks/${w.week}`}
            className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-5 py-4 flex items-center justify-between hover:border-pmp-gray-600 transition-colors"
          >
            <div>
              <p className="text-pmp-white font-bold">Week {w.week} <span className="text-pmp-gray-600 font-normal text-xs">v{w.version}</span></p>
              <p className="text-pmp-gray-600 text-xs mt-0.5">
                Imported {new Date(w.imported_at).toLocaleString()}
              </p>
            </div>
            <span className={`text-xs font-bold uppercase tracking-widest px-2 py-1 rounded ${STATUS_COLORS[w.status] ?? 'bg-pmp-gray-800 text-pmp-gray-400'}`}>
              {w.status}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implement the week detail / mission control page**

Create `app/admin/oracle/weeks/[week]/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/server'
import { getProfile } from '@/lib/oracle/profile'
import { getServiceClient } from '@/lib/league/db'
import { getCurrentSeason } from '@/lib/oracle/season'
import { AdminWeekClient } from './client'

export const dynamic = 'force-dynamic'

interface RouteContext { params: Promise<{ week: string }> }

export default async function AdminWeekPage({ params }: RouteContext) {
  const { week: weekStr } = await params
  const week = parseInt(weekStr, 10)

  const session = await getSession()
  if (!session) redirect('/')
  const profile = await getProfile(session.user.id)
  if (!profile?.isAdmin) redirect('/')

  const season = await getCurrentSeason()
  if (!season) redirect('/admin/oracle/weeks')

  const db = getServiceClient()

  // Get latest version for this week
  const { data: latestRow } = await db
    .from('oracle_weekly_standings')
    .select('version, status, imported_at, approved_at, published_at')
    .eq('season_id', season.id)
    .eq('week', week)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!latestRow) redirect('/admin/oracle/weeks')

  const { version, status, imported_at, published_at } = latestRow as {
    version: number; status: string; imported_at: string; approved_at: string | null; published_at: string | null
  }

  // Fetch top 5 per position for preview
  const { data: previewRows } = await db
    .from('oracle_weekly_standings')
    .select('position, rank, player_name, ppr_points')
    .eq('season_id', season.id)
    .eq('week', week)
    .eq('version', version)
    .lte('rank', 5)
    .order('position')
    .order('rank')

  const preview: Record<string, Array<{ rank: number; player_name: string; ppr_points: number }>> = {
    QB: [], RB: [], WR: [], TE: [],
  }
  for (const r of (previewRows ?? []) as Array<{ position: string; rank: number; player_name: string; ppr_points: number }>) {
    if (preview[r.position]) preview[r.position].push(r)
  }

  return (
    <AdminWeekClient
      week={week}
      version={version}
      status={status}
      importedAt={imported_at}
      publishedAt={published_at}
      preview={preview}
    />
  )
}
```

- [ ] **Step 3: Implement the client component**

Create `app/admin/oracle/weeks/[week]/client.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface WeekPreview {
  rank: number
  player_name: string
  ppr_points: number
}

interface AdminWeekClientProps {
  week: number
  version: number
  status: string
  importedAt: string
  publishedAt: string | null
  preview: Record<string, WeekPreview[]>
}

export function AdminWeekClient({ week, version, status, importedAt, publishedAt, preview }: AdminWeekClientProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ scored?: number; durationSeconds?: number; publishedAt?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const call = async (action: 'approve' | 'reject' | 'reimport') => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`/api/admin/oracle/weeks/${week}/${action}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Failed')
      } else if (action === 'approve') {
        setResult({ scored: json.scored, durationSeconds: json.durationSeconds, publishedAt: json.publishedAt })
      } else {
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  const isPending = status === 'pending'
  const isApproved = status === 'approved'
  const POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const

  return (
    <div className="min-h-screen bg-pmp-black px-6 py-8 max-w-md mx-auto flex flex-col gap-6">
      <div>
        <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">Oracle Admin</p>
        <h1 className="text-pmp-white font-black text-2xl mt-1">Week {week} <span className="text-pmp-gray-600 font-normal text-lg">v{version}</span></h1>
        <p className="text-pmp-gray-600 text-xs mt-1">
          Imported {new Date(importedAt).toLocaleString()} · Sleeper API · Status: <span className="text-pmp-white font-semibold">{status}</span>
        </p>
        {publishedAt && (
          <p className="text-green-400 text-xs mt-0.5">Published {new Date(publishedAt).toLocaleString()}</p>
        )}
      </div>

      {/* Position previews */}
      <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-5 py-4 flex flex-col gap-4">
        {POSITIONS.map(pos => (
          <div key={pos}>
            <p className="text-pmp-red text-xs font-bold uppercase tracking-widest mb-1">{pos}</p>
            {preview[pos]?.map(p => (
              <div key={p.rank} className="flex justify-between text-sm py-0.5">
                <span className="text-pmp-white">{p.rank}. {p.player_name}</span>
                <span className="text-pmp-gray-500">{p.ppr_points.toFixed(1)} pts</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Result / error feedback */}
      {result && (
        <div className="bg-green-950 border border-green-800 rounded-xl px-5 py-4">
          <p className="text-green-400 font-bold text-sm">✅ Week {week} Published</p>
          <p className="text-green-600 text-xs mt-1">{result.scored?.toLocaleString()} users scored</p>
          <p className="text-green-600 text-xs">Leaderboard updated</p>
          <p className="text-green-600 text-xs">{result.durationSeconds}s</p>
        </div>
      )}
      {error && (
        <p className="text-pmp-red text-sm">{error}</p>
      )}

      {/* Actions */}
      {!result && (
        <div className="flex flex-col gap-2">
          {isPending && (
            <button
              onClick={() => call('approve')}
              disabled={loading}
              className="w-full bg-pmp-red text-pmp-white font-bold py-4 rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {loading ? 'Publishing…' : `Approve Week ${week} Rankings`}
            </button>
          )}
          {isPending && (
            <button
              onClick={() => call('reject')}
              disabled={loading}
              className="w-full bg-pmp-gray-800 text-pmp-gray-400 font-semibold py-3 rounded-xl text-sm hover:bg-pmp-gray-700 transition-colors disabled:opacity-40"
            >
              Reject
            </button>
          )}
          <button
            onClick={() => call('reimport')}
            disabled={loading}
            className="w-full bg-pmp-gray-900 border border-pmp-gray-700 text-pmp-gray-400 font-semibold py-3 rounded-xl text-sm hover:border-pmp-gray-500 transition-colors disabled:opacity-40"
          >
            Re-import from Sleeper
          </button>
          {isApproved && (
            <p className="text-pmp-gray-600 text-xs text-center">This week is live. Re-import to create a new version.</p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify admin routes are accessible**

Run `npx next build` and confirm `/admin/oracle/weeks` and `/admin/oracle/weeks/[week]` appear in the route list.

- [ ] **Step 5: Commit**

```bash
git add app/admin/oracle/weeks/page.tsx \
        app/admin/oracle/weeks/[week]/page.tsx \
        app/admin/oracle/weeks/[week]/client.tsx
git commit -m "feat: admin Oracle weeks UI — mission control for weekly standings"
```

---

### Task 6: Dashboard Weekly Standing Card

**Files:**
- Create: `components/oracle/WeeklyStandingCard.tsx`
- Modify: `app/challenge/page.tsx`

**Interfaces:**
- Consumes: `GET /api/oracle/standing/current` from Task 4
- Produces: `<WeeklyStandingCard>` — used in the signed-in dashboard

- [ ] **Step 1: Implement `WeeklyStandingCard`**

Create `components/oracle/WeeklyStandingCard.tsx`:

```typescript
'use client'

interface WeeklyStanding {
  overall_score: number
  projected_rank: number
  total_users: number
  percentile: number
  previous_rank: number | null
  rank_movement: number | null
  score_delta: number | null
}

interface WeeklyStandingCardProps {
  week: number
  standing: WeeklyStanding
  /** Best win player name (highest scoring individual pick this week) */
  bestWinPlayer: string | null
  story: string
}

export function WeeklyStandingCard({ week, standing, bestWinPlayer, story }: WeeklyStandingCardProps) {
  const { projected_rank, percentile, rank_movement, score_delta } = standing

  const topPct = percentile < 1
    ? `Top 1%`
    : `Top ${Math.ceil(percentile)}%`

  const movementText = rank_movement == null
    ? null
    : rank_movement < 0
      ? `▲ +${Math.abs(rank_movement)} places`
      : rank_movement > 0
        ? `▼ ${rank_movement} places`
        : '— No change'

  const movementColor = rank_movement == null || rank_movement === 0
    ? 'text-pmp-gray-500'
    : rank_movement < 0
      ? 'text-green-400'
      : 'text-pmp-red'

  const scoreDeltaText = score_delta == null
    ? null
    : score_delta > 0
      ? `+${score_delta.toFixed(1)} pts this week`
      : score_delta < 0
        ? `${score_delta.toFixed(1)} pts this week`
        : null

  return (
    <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl overflow-hidden">
      {/* Header strip */}
      <div className="bg-pmp-gray-800 px-5 py-2 flex items-center justify-between">
        <p className="text-pmp-red text-xs font-bold uppercase tracking-[0.2em]">⚡ Live Oracle Standing</p>
        <p className="text-pmp-gray-500 text-xs">Week {week}</p>
      </div>

      <div className="px-5 py-5 flex flex-col gap-4">
        {/* Rank + percentile */}
        <div className="flex items-baseline gap-3">
          <p className="text-pmp-white font-black text-4xl">#{projected_rank.toLocaleString()}</p>
          <div>
            <p className="text-pmp-white font-bold text-lg">{topPct}</p>
            {movementText && (
              <p className={`text-sm font-semibold ${movementColor}`}>{movementText}</p>
            )}
          </div>
        </div>

        {scoreDeltaText && (
          <p className="text-pmp-gray-500 text-xs -mt-2">{scoreDeltaText}</p>
        )}

        {/* Your Story */}
        {story && (
          <div className="border-t border-pmp-gray-800 pt-3">
            <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest mb-1">Your Story This Week</p>
            <p className="text-pmp-gray-400 text-sm leading-relaxed">{story}</p>
          </div>
        )}

        {/* Best win */}
        {bestWinPlayer && (
          <div className="border-t border-pmp-gray-800 pt-3 flex items-center justify-between">
            <div>
              <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">Best Win</p>
              <p className="text-pmp-white text-sm font-semibold mt-0.5">{bestWinPlayer}</p>
            </div>
          </div>
        )}

        {/* Leaderboard CTA */}
        <a
          href="/challenge/leaderboard"
          className="text-pmp-red text-sm font-semibold hover:opacity-80"
        >
          View Leaderboard →
        </a>
      </div>

      <div className="px-5 pb-3">
        <p className="text-pmp-gray-700 text-[10px]">
          Based on results through Week {week}. Final standings determined after the season ends.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Modify `app/challenge/page.tsx` to fetch and show the card**

In `app/challenge/page.tsx`, add after the existing imports:

```typescript
import { WeeklyStandingCard } from '@/components/oracle/WeeklyStandingCard'
```

Inside `ChallengePage`, in the signed-in block, add a weekly standing fetch after the existing parallel fetches. Add this inside the `if (session && season)` block after the existing `Promise.all`:

```typescript
// Fetch current live Oracle standing
let weeklyStanding: {
  overall_score: number; projected_rank: number; total_users: number; percentile: number;
  previous_rank: number | null; rank_movement: number | null; score_delta: number | null
} | null = null
let liveWeek: number | null = null
let bestWinPlayer: string | null = null
let storyText = ''

const standingRes = await fetch(
  `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/oracle/standing/current`,
  { headers: { cookie: (await import('next/headers')).cookies().toString() } }
).catch(() => null)

if (standingRes?.ok) {
  const { standing, week } = await standingRes.json()
  weeklyStanding = standing
  liveWeek = week
}
```

Wait — calling an internal API route from a server component is awkward and requires passing cookies. A cleaner approach: extract the standing fetch logic directly (reuse the DB query inline). Let me revise:

Replace the fetch-based approach in the page with a direct DB query:

```typescript
// Inside if (session && season) block, add to the Promise.all:
db
  .from('oracle_weekly_standings')
  .select('week, version')
  .eq('season_id', season.id)
  .eq('status', 'approved')
  .order('week', { ascending: false })
  .order('version', { ascending: false })
  .limit(1)
  .maybeSingle(),
```

Then after the Promise.all resolves:

```typescript
const latestWeekRow = rankingResults[4] // adjust index based on position in Promise.all
// ...fetch user's score for that week
let weeklyStanding = null
let liveWeek: number | null = null
if (latestWeekRow?.data) {
  const { week, version } = latestWeekRow.data as { week: number; version: number }
  liveWeek = week
  const { data: scoreRow } = await db
    .from('oracle_weekly_scores')
    .select('overall_score, projected_rank, total_users, percentile, previous_rank, rank_movement, score_delta')
    .eq('user_id', session.user.id)
    .eq('season_id', season.id)
    .eq('week', week)
    .eq('version', version)
    .maybeSingle()
  weeklyStanding = scoreRow ?? null
}
```

For the story text and best win player:

```typescript
let storyText = ''
let bestWinPlayer: string | null = null

if (weeklyStanding && liveWeek) {
  const { percentile, rank_movement, score_delta } = weeklyStanding
  const topPct = `Top ${Math.ceil(percentile)}%`

  // Compute best win: user's pick closest to weekly standing rank
  // This is a simplified version; compute from challenge_rankings + weekly_standings
  // TODO: enhance to show specific player name when ranking_score_detail weekly data is available
  if (rank_movement != null && rank_movement < 0) {
    const prevPct = weeklyStanding.previous_rank && weeklyStanding.total_users
      ? `Top ${Math.ceil(((weeklyStanding.total_users - weeklyStanding.previous_rank + 1) / weeklyStanding.total_users) * 100)}%`
      : null
    storyText = prevPct
      ? `You climbed from ${prevPct} → ${topPct}${score_delta && score_delta > 0 ? `, gaining ${score_delta.toFixed(1)} pts.` : '.'}`
      : `You climbed to ${topPct} this week.`
  } else if (rank_movement != null && rank_movement > 0) {
    storyText = `A tough week — you dropped to ${topPct}. Stay the course.`
  } else {
    storyText = `Holding steady at ${topPct}.`
  }
}
```

In the signed-in return JSX, replace the existing marketing copy (the countdown + community card area) with the weekly card when a live week exists. Add this block before the countdown card:

```tsx
{/* Live Oracle Standing — shown during NFL season */}
{weeklyStanding && liveWeek && (
  <WeeklyStandingCard
    week={liveWeek}
    standing={weeklyStanding}
    bestWinPlayer={bestWinPlayer}
    story={storyText}
  />
)}
```

- [ ] **Step 3: Run `npx next build` to verify no TypeScript errors**

Expected: build succeeds with `/challenge` listed as a dynamic route.

- [ ] **Step 4: Commit**

```bash
git add components/oracle/WeeklyStandingCard.tsx app/challenge/page.tsx
git commit -m "feat: live Oracle standing card on dashboard"
```

---

### Task 7: Leaderboard Weekly Mode

**Files:**
- Modify: `app/challenge/leaderboard/page.tsx`

**Interfaces:**
- Consumes: `oracle_weekly_scores` table (projected_rank, percentile, rank_movement)
- Consumes: `oracle_weekly_standings` table (to find latest approved week)
- Produces: leaderboard with week selector, movement column, and badges

- [ ] **Step 1: Rewrite `app/challenge/leaderboard/page.tsx`**

The leaderboard page now has two modes:
- **Final (season scored):** existing accuracy_scores view — unchanged
- **Live (in-season):** reads from oracle_weekly_scores for the latest approved week

Read the current file first (already done at session start), then apply this logic:

```typescript
// At the top of the component, after existing season fetch:

// Find latest approved week
const { data: latestWeekRow } = await db
  .from('oracle_weekly_standings')
  .select('week, version, published_at')
  .eq('season_id', season ? season.id : '')
  .eq('status', 'approved')
  .order('week', { ascending: false })
  .order('version', { ascending: false })
  .limit(1)
  .maybeSingle()

const liveWeek = latestWeekRow
  ? (latestWeekRow as { week: number; version: number; published_at: string })
  : null
const isLiveSeason = !!liveWeek && !isScored

if (isLiveSeason && liveWeek) {
  const { week, version } = liveWeek

  // Top 50 by projected_rank for this week
  const { data: weeklyScores } = await db
    .from('oracle_weekly_scores')
    .select('user_id, projected_rank, total_users, percentile, rank_movement, overall_score')
    .eq('season_id', season!.id)
    .eq('week', week)
    .eq('version', version)
    .order('projected_rank', { ascending: true })
    .limit(50)

  const weekUserIds = (weeklyScores ?? []).map((s: { user_id: string }) => s.user_id)
  const { data: weekProfiles } = weekUserIds.length > 0
    ? await db.from('user_profiles').select('user_id, display_name, username, avatar_url').in('user_id', weekUserIds)
    : { data: [] }

  const weekProfileMap = new Map(
    (weekProfiles ?? []).map((p: { user_id: string; display_name: string; username: string | null; avatar_url: string | null }) => [p.user_id, p])
  )

  // Compute week headline: biggest climber (most negative rank_movement)
  let biggestClimber: { username: string; movement: number } | null = null
  for (const s of (weeklyScores ?? []) as Array<{ user_id: string; rank_movement: number | null; projected_rank: number }>) {
    if (s.rank_movement != null && s.rank_movement < 0) {
      if (!biggestClimber || Math.abs(s.rank_movement) > biggestClimber.movement) {
        const p = weekProfileMap.get(s.user_id)
        biggestClimber = { username: (p as { username: string | null } | undefined)?.username ?? 'someone', movement: Math.abs(s.rank_movement) }
      }
    }
  }

  // Badge logic
  function getBadge(userId: string, movement: number | null): string | null {
    if (biggestClimber?.username === (weekProfileMap.get(userId) as { username: string | null } | undefined)?.username) return '🚀'
    if (movement != null && movement < -50) return '🔥'
    return null
  }

  return (
    <div className="min-h-[100dvh] bg-pmp-black flex flex-col">
      <div className="px-4 py-6 max-w-md mx-auto w-full flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-pmp-white font-bold text-xl">⚡ Live Oracle Standings</h1>
          <p className="text-pmp-gray-500 text-sm">
            {(totalEntries ?? 0).toLocaleString()} entries · Week {week} standings
          </p>
        </div>

        {/* Week headline */}
        {biggestClimber && (
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-4 py-3">
            <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest mb-1">Week {week} Highlights</p>
            <p className="text-pmp-white text-sm">
              🚀 Biggest Climber: <span className="font-semibold">@{biggestClimber.username}</span>{' '}
              <span className="text-green-400">+{biggestClimber.movement} places</span>
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {(weeklyScores ?? []).map((score: {
            user_id: string; projected_rank: number; percentile: number;
            rank_movement: number | null; overall_score: number
          }) => {
            const profile = weekProfileMap.get(score.user_id) as {
              display_name: string; username: string | null; avatar_url: string | null
            } | undefined
            const topPct = score.percentile < 1 ? 'Top 1%' : `Top ${Math.ceil(score.percentile)}%`
            const movement = score.rank_movement
            const badge = getBadge(score.user_id, movement)

            return (
              <div
                key={score.user_id}
                className="flex items-center gap-3 bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-4 py-3"
              >
                <span className="text-sm font-black w-7 text-right shrink-0 text-pmp-gray-600">
                  {score.projected_rank}
                </span>
                <div className="w-8 h-8 rounded-full bg-pmp-gray-800 flex items-center justify-center shrink-0 overflow-hidden">
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                    : <span className="text-pmp-white text-xs font-bold">{(profile?.display_name ?? 'U')[0]}</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-pmp-white text-sm font-semibold truncate">{profile?.display_name ?? 'Anonymous'}</p>
                  <p className="text-pmp-gray-600 text-xs">{topPct}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {movement != null && (
                    <span className={`text-xs font-semibold ${movement < 0 ? 'text-green-400' : movement > 0 ? 'text-pmp-red' : 'text-pmp-gray-600'}`}>
                      {movement < 0 ? `▲ ${Math.abs(movement)}` : movement > 0 ? `▼ ${movement}` : '—'}
                    </span>
                  )}
                  {badge && <span className="text-base">{badge}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

Keep the existing final-season leaderboard (when `isScored`) and pre-season entry count views intact — only add the new live-season branch above.

- [ ] **Step 2: Run `npx next build`**

Expected: build passes.

- [ ] **Step 3: Commit**

```bash
git add app/challenge/leaderboard/page.tsx
git commit -m "feat: weekly live leaderboard with movement column and badges"
```

---

### Task 8: Profile Sparkline + Player Current Finish + Vercel Cron

**Files:**
- Modify: `app/u/[username]/page.tsx`
- Modify: `app/u/[username]/client.tsx`
- Modify: `app/players/[id]/page.tsx`
- Create: `vercel.json`

**Interfaces:**
- Consumes: `oracle_weekly_scores` for profile sparkline data
- Consumes: `oracle_weekly_standings` for player current finish

- [ ] **Step 1: Add weekly scores fetch to profile page**

In `app/u/[username]/page.tsx`, inside the `Promise.all`, add:

```typescript
// Fetch weekly score history for sparkline (all weeks, latest version per week)
db
  .from('oracle_weekly_scores')
  .select('week, overall_score, projected_rank, total_users, percentile, rank_movement, version')
  .eq('user_id', profile.user_id)
  .eq('season_id', season ? season.id : '')
  .order('week', { ascending: true })
  .order('version', { ascending: false }),
```

After the Promise.all, process the weekly history:

```typescript
const allWeeklyRows = (weeklyScoresResult?.data ?? []) as Array<{
  week: number; overall_score: number; projected_rank: number;
  total_users: number; percentile: number; rank_movement: number | null; version: number
}>

// Deduplicate: keep latest version per week
const weekMap = new Map<number, typeof allWeeklyRows[0]>()
for (const row of allWeeklyRows) {
  if (!weekMap.has(row.week)) weekMap.set(row.week, row)
}
const weeklyHistory = Array.from(weekMap.values()).sort((a, b) => a.week - b.week)

// Current week stats
const currentWeekScore = weeklyHistory.length > 0 ? weeklyHistory[weeklyHistory.length - 1] : null
```

Pass `weeklyHistory` and `currentWeekScore` as props to `ProfileClient`.

- [ ] **Step 2: Add sparkline to `app/u/[username]/client.tsx`**

Read the client file, then add a sparkline section above the existing stats. The sparkline is a simple inline SVG — no charting library.

Add this component at the bottom of the client file:

```typescript
function Sparkline({ data }: { data: Array<{ week: number; percentile: number }> }) {
  if (data.length < 2) return null

  const W = 280
  const H = 60
  const padding = 8

  const minPct = Math.min(...data.map(d => d.percentile))
  const maxPct = Math.max(...data.map(d => d.percentile))
  const range = maxPct - minPct || 1

  // Y is inverted: lower percentile (better) = higher on chart
  const toX = (i: number) => padding + (i / (data.length - 1)) * (W - padding * 2)
  const toY = (pct: number) => padding + ((pct - minPct) / range) * (H - padding * 2)

  const points = data.map((d, i) => `${toX(i)},${toY(d.percentile)}`).join(' ')
  const latest = data[data.length - 1]
  const earliest = data[0]

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-pmp-gray-600">
        <span>Wk {earliest.week}</span>
        <span>Wk {latest.week}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 60 }}>
        <polyline
          points={points}
          fill="none"
          stroke="#ef4444"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Latest dot */}
        <circle
          cx={toX(data.length - 1)}
          cy={toY(latest.percentile)}
          r="3"
          fill="#ef4444"
        />
      </svg>
      <div className="flex justify-between text-xs">
        <span className="text-pmp-gray-600">
          Top {Math.ceil(earliest.percentile)}%
        </span>
        <span className="text-pmp-white font-semibold">
          Top {Math.ceil(latest.percentile)}%
        </span>
      </div>
    </div>
  )
}
```

In `ProfileClient`, add `weeklyHistory` prop and render the sparkline as the profile hero (above the existing score cards):

```typescript
{weeklyHistory.length >= 2 && (
  <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-5 py-5">
    <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Season Progress</p>
    <Sparkline data={weeklyHistory.map(w => ({ week: w.week, percentile: w.percentile }))} />
    {currentWeekScore && (
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-pmp-gray-800">
        <div>
          <p className="text-pmp-gray-600 text-xs">Week {currentWeekScore.week}</p>
          <p className="text-pmp-white font-bold">#{currentWeekScore.projected_rank.toLocaleString()}</p>
        </div>
        <div className="text-right">
          <p className="text-pmp-gray-600 text-xs">Percentile</p>
          <p className="text-pmp-white font-bold">Top {Math.ceil(currentWeekScore.percentile)}%</p>
        </div>
        {currentWeekScore.rank_movement != null && currentWeekScore.rank_movement !== 0 && (
          <div className="text-right">
            <p className="text-pmp-gray-600 text-xs">This Week</p>
            <p className={currentWeekScore.rank_movement < 0 ? 'text-green-400 font-bold' : 'text-pmp-red font-bold'}>
              {currentWeekScore.rank_movement < 0 ? `▲ ${Math.abs(currentWeekScore.rank_movement)}` : `▼ ${currentWeekScore.rank_movement}`}
            </p>
          </div>
        )}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 3: Add current finish to player pages**

In `app/players/[id]/page.tsx`, after the existing `stats` fetch, add:

```typescript
// After lock: fetch current weekly finish for this player
let currentFinish: { rank: number; ppr_points: number; week: number } | null = null
if (season) {
  const { data: latestWeek } = await getServiceClient()
    .from('oracle_weekly_standings')
    .select('week, version')
    .eq('season_id', season.id)
    .eq('status', 'approved')
    .order('week', { ascending: false })
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestWeek) {
    const lw = latestWeek as { week: number; version: number }
    const { data: playerRow } = await getServiceClient()
      .from('oracle_weekly_standings')
      .select('rank, ppr_points')
      .eq('season_id', season.id)
      .eq('week', lw.week)
      .eq('version', lw.version)
      .eq('player_id', id)
      .maybeSingle()

    if (playerRow) {
      currentFinish = { ...(playerRow as { rank: number; ppr_points: number }), week: lw.week }
    }
  }
}
```

In the JSX, add a "Current Finish" row to the existing stats card:

```tsx
{currentFinish && (
  <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-4 flex flex-col gap-1">
    <p className="text-pmp-gray-500 text-xs uppercase tracking-widest">Current Finish · Wk {currentFinish.week}</p>
    <p className="text-pmp-white text-3xl font-bold">
      #{currentFinish.rank} {stats.playerName.split(' ')[1] ?? ''} PPR
    </p>
    <p className="text-pmp-gray-600 text-xs">{currentFinish.ppr_points.toFixed(1)} cumulative pts</p>
  </div>
)}
```

- [ ] **Step 4: Create `vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/admin/oracle/weekly-import/trigger",
      "schedule": "0 11 * * 2"
    }
  ]
}
```

`0 11 * * 2` = every Tuesday at 11:00 UTC = 7:00 AM ET (summer, UTC-4).

Note: Vercel Cron sends requests with the `Authorization: Bearer <CRON_SECRET>` header automatically when you set `CRON_SECRET` in Vercel environment variables — but actually Vercel does **not** send this automatically. You need to set `CRON_SECRET` as an env var and the cron will be triggered by Vercel without any auth header. Update the trigger endpoint to also accept requests from Vercel's own cron service by checking `request.headers.get('x-vercel-cron')` header:

Update `app/api/admin/oracle/weekly-import/trigger/route.ts` auth check:

```typescript
// Accept either:
// 1. Vercel Cron (x-vercel-cron header, automatically set by Vercel)
// 2. Manual trigger with Bearer token
const isVercelCron = request.headers.get('x-vercel-cron') === '1'
const auth = request.headers.get('Authorization')
const isManualAuth = auth === `Bearer ${process.env.CRON_SECRET}`

if (!isVercelCron && !isManualAuth) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

- [ ] **Step 5: Run final build**

```bash
npx next build
```

Expected: all routes build successfully. Confirm:
- `/api/admin/oracle/weekly-import/trigger`
- `/api/admin/oracle/weeks/[week]/approve`
- `/admin/oracle/weeks`
- `/admin/oracle/weeks/[week]`
- all appear in the route list.

- [ ] **Step 6: Commit**

```bash
git add app/u/[username]/page.tsx \
        app/u/[username]/client.tsx \
        app/players/[id]/page.tsx \
        vercel.json
git commit -m "feat: profile sparkline, player current finish, Vercel cron config"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| oracle_weekly_standings table | Task 1 |
| oracle_weekly_scores table (insert-only, with percentile, scoring_version, score_delta, rank_movement) | Task 1 |
| Status: importing → pending → approved (+ publishing, rejected) | Task 1 schema + Task 4 |
| Versioning (re-import creates v2) | Task 3 trigger logic |
| published_at / approved_at / calculated_at | Task 1 schema |
| Sleeper API fetch + cumulative PPR | Task 3 sleeperStats.ts |
| Vercel Cron Tuesday 7 AM ET | Task 8 vercel.json |
| Admin approval pipeline with "publishing" atomic swap | Task 4 approve route |
| scoreUserForWeek / scoreAllUsersForWeek | Task 2 weeklyScoring.ts |
| Preload previous-week ranks (not N queries) | Task 2 scoreAllUsersForWeek |
| Sequential scoring + TODO chunk comment | Task 2 |
| Dashboard weekly card with story + best win + movement | Task 6 |
| Leaderboard: movement column, badges (🚀), week headline | Task 7 |
| Profile: sparkline hero | Task 8 |
| Player pages: current finish | Task 8 |
| Admin UI: mission control with preview + Approve/Reject/Re-import | Task 5 |
| Admin completion stats (users scored, duration) | Task 5 client.tsx |
| getCurrentNFLWeek() | Task 2 |

**Out of scope (confirmed):** push notifications, friends, oracle_seasons aggregate table, prediction scoring in weekly, scoring chunking.
