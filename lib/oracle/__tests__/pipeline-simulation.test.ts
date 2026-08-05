/**
 * Pipeline Simulation — Full Week 1 Run + Verification
 *
 * Simulates all 5 pipeline stages with realistic sample data.
 * Uses the actual pure scoring functions; DB layer is an in-memory store.
 *
 * Verifies:
 *   1. Step-by-step stage output (stats sync → GT → scoring → ranking)
 *   2. Idempotency      — second run produces identical results
 *   3. Failure recovery — partial failure + rerun gives correct final state
 *   4. Catch-up         — out-of-order pipeline runs produce correct standings
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { scorePosition, scoreEntry } from '../scoring'
import type { GroundTruthEntry, EntryScore } from '../scoring'
import type { RankingRow } from '../rankings'

// ─── Types ────────────────────────────────────────────────────────────────────

type Pos = 'QB' | 'RB' | 'WR' | 'TE'
const POSITIONS: Pos[] = ['QB', 'RB', 'WR', 'TE']

interface RawStatRow {
  player_id: string
  player_name: string
  position: string      // intentionally loose — sync filter rejects non-oracle positions
  ppr_points: number
}

interface StoredStatRow extends RawStatRow {
  week: number
  position: Pos
}

interface AccuracyRow {
  overall_score: number
  top10_hits: number
  total_rank_error: number
  global_rank: number | null
  prev_rank: number | null
  rank_change: number | null
}

// ─── In-memory DB simulation ──────────────────────────────────────────────────

class SimDB {
  // player_stats: key = `${week}:${player_id}` (UNIQUE — idempotent upsert)
  playerStats = new Map<string, StoredStatRow>()
  // ground_truth: key = position (delete-then-insert simulated by overwrite)
  groundTruth = new Map<Pos, GroundTruthEntry[]>()
  // accuracy_scores: key = user_id (upsert — idempotent)
  scores = new Map<string, AccuracyRow>()
  // oracle_entries: key = user_id → entry_number (written once; never changes)
  entries = new Map<string, number>()
  private _nextEntry = 0
  // sync_jobs: simulates concurrent-run lock
  jobRunning = false

  registerEntry(userId: string): number {
    if (!this.entries.has(userId)) this.entries.set(userId, ++this._nextEntry)
    return this.entries.get(userId)!
  }

  upsertStat(week: number, row: RawStatRow & { position: Pos }) {
    // UNIQUE(week, player_id) → Map.set() is idempotent
    this.playerStats.set(`${week}:${row.player_id}`, { ...row, week })
  }

  statsCount(): number { return this.playerStats.size }

  clone(): SimDB {
    const copy = new SimDB()
    copy.playerStats = new Map(this.playerStats)
    copy.groundTruth = new Map(this.groundTruth)
    copy.scores = new Map(this.scores)
    copy.entries = new Map(this.entries)
    copy._nextEntry = this._nextEntry
    copy.jobRunning = this.jobRunning
    return copy
  }
}

// ─── Stage implementations (pure logic mirroring the real pipeline modules) ──

const SYNC_POSITIONS = new Set<string>(['QB', 'RB', 'WR', 'TE'])

/** Stage 1: stats-sync.ts — filter to relevant positions, upsert into player_stats */
function syncStats(
  db: SimDB,
  week: number,
  rawStats: RawStatRow[],
  opts?: { simulateError?: string },
): { upserted: number; skipped: number; errors: string[] } {
  if (opts?.simulateError) {
    // Simulate a Sleeper API or DB batch failure — no rows written
    return { upserted: 0, skipped: 0, errors: [opts.simulateError] }
  }
  let upserted = 0; let skipped = 0
  for (const row of rawStats) {
    if (!SYNC_POSITIONS.has(row.position) || row.ppr_points <= 0) { skipped++; continue }
    db.upsertStat(week, row as RawStatRow & { position: Pos })
    upserted++
  }
  return { upserted, skipped, errors: [] }
}

/** Stage 2: ground-truth.ts — cumulative PPR top-10 per position */
function buildGroundTruth(
  db: SimDB,
  upToWeek: number,
): Record<Pos, GroundTruthEntry[]> {
  // Aggregate cumulative PPR per player for all weeks ≤ upToWeek
  const totals = new Map<string, { total: number; name: string; position: Pos }>()
  for (const row of db.playerStats.values()) {
    if (row.week > upToWeek) continue
    const existing = totals.get(row.player_id)
    totals.set(row.player_id, {
      total: (existing?.total ?? 0) + row.ppr_points,
      name: existing?.name ?? row.player_name,
      position: existing?.position ?? row.position,
    })
  }

  const result = {} as Record<Pos, GroundTruthEntry[]>
  for (const pos of POSITIONS) {
    const ranked = [...totals.entries()]
      .filter(([, v]) => v.position === pos)
      .sort((a, b) => {
        const diff = b[1].total - a[1].total
        if (diff !== 0) return diff
        // Stable tiebreaker: player_id alphabetically
        return a[0] < b[0] ? -1 : 1
      })
      .slice(0, 10)
      .map(([playerId, v], i) => ({
        playerId,
        rank: i + 1,
        pprPoints: Math.round(v.total * 100) / 100,
      }))
    result[pos] = ranked
    // delete-then-insert: Map.set() overwrites (idempotent)
    db.groundTruth.set(pos, ranked)
  }
  return result
}

/** Stages 3+4: scoring-runner.ts — score a user's entry and upsert to accuracy_scores */
function scoreUser(
  db: SimDB,
  userId: string,
  picks: Record<Pos, RankingRow[]>,
  gt: Record<Pos, GroundTruthEntry[]>,
): EntryScore {
  const entry = scoreEntry(picks, gt)
  const prevRank = db.scores.get(userId)?.global_rank ?? null
  // upsert: Map.set() overwrites (idempotent)
  db.scores.set(userId, {
    overall_score: entry.overallScore,
    top10_hits: entry.top10Hits,
    total_rank_error: entry.totalRankError,
    global_rank: null,
    prev_rank: prevRank,
    rank_change: null,
  })
  return entry
}

/** Stage 5: ranker.ts — sort by tiebreaker chain, assign global_rank */
function rankAll(
  db: SimDB,
  currentWeek: number,
): Array<{ userId: string; rank: number; score: number; prevRank: number | null; rankChange: number | null }> {
  const list = [...db.scores.entries()].map(([userId, s]) => ({
    userId,
    ...s,
    entryNumber: db.entries.get(userId) ?? Number.MAX_SAFE_INTEGER,
  }))

  // Tiebreaker: overallScore DESC → top10Hits DESC → totalRankError ASC → entryNumber ASC
  list.sort((a, b) => {
    if (b.overall_score !== a.overall_score) return b.overall_score - a.overall_score
    if (b.top10_hits !== a.top10_hits) return b.top10_hits - a.top10_hits
    if (a.total_rank_error !== b.total_rank_error) return a.total_rank_error - b.total_rank_error
    return a.entryNumber - b.entryNumber
  })

  return list.map((row, i) => {
    const newRank = i + 1
    const rankChange = row.prev_rank != null ? row.prev_rank - newRank : null
    const current = db.scores.get(row.userId)!
    db.scores.set(row.userId, { ...current, global_rank: newRank, rank_change: rankChange })
    return { userId: row.userId, rank: newRank, score: row.overall_score, prevRank: row.prev_rank, rankChange }
  })
}

// ─── Sample data: 11 players per position (so #11 is always excluded from top-10) ──

function genStats(pos: Pos, pts: number[]): RawStatRow[] {
  return pts.map((ppr_points, i) => ({
    player_id: `${pos.toLowerCase()}${i + 1}`,
    player_name: `${pos} Player ${i + 1}`,
    position: pos,
    ppr_points,
  }))
}

const WEEK1_STATS: RawStatRow[] = [
  ...genStats('QB', [38.2, 35.6, 32.1, 29.4, 27.8, 26.0, 24.3, 22.7, 21.1, 19.5, 17.2]),
  ...genStats('RB', [42.3, 38.1, 34.7, 31.2, 28.5, 25.9, 23.4, 21.0, 18.7, 16.3, 14.0]),
  ...genStats('WR', [36.8, 33.5, 30.2, 27.6, 25.1, 22.8, 20.4, 18.0, 15.7, 13.3, 10.9]),
  ...genStats('TE', [28.4, 24.1, 20.8, 17.5, 14.2, 11.9,  9.6,  7.3,  5.0,  4.2,  2.9]),
  // Non-oracle rows that must be filtered out:
  { player_id: 'k1',  player_name: 'Kicker Tucker', position: 'K',  ppr_points: 9.0 },
  { player_id: 'def1',player_name: 'Defense Eagles', position: 'DEF', ppr_points: 10.0 },
  { player_id: 'rb_inactive', player_name: 'Injured RB', position: 'RB', ppr_points: 0 },
]

// Week 2: qb2 surges (+10), qb1 has off week (-10); all other stats identical
const WEEK2_STATS: RawStatRow[] = WEEK1_STATS
  .filter(r => r.position !== 'K' && r.position !== 'DEF' && r.player_id !== 'rb_inactive')
  .map(r => ({
    ...r,
    ppr_points:
      r.player_id === 'qb2' ? r.ppr_points + 10 :
      r.player_id === 'qb1' ? r.ppr_points - 10 :
      r.ppr_points,
  }))

// ─── User picks (oracle_entries submitted at season open) ─────────────────────

function picks(pos: Pos, ids: string[]): RankingRow[] {
  return ids.map((playerId, i) => ({ playerRank: i + 1, playerId, playerName: playerId }))
}

function positionPicks(pattern: 'perfect' | 'swapped' | 'half' | 'reversed' | 'miss'): Record<Pos, RankingRow[]> {
  const p: Record<Pos, RankingRow[]> = { QB: [], RB: [], WR: [], TE: [] }
  for (const pos of POSITIONS) {
    const pre = pos.toLowerCase()
    switch (pattern) {
      case 'perfect':  p[pos] = picks(pos, [1,2,3,4,5,6,7,8,9,10].map(n => `${pre}${n}`)); break
      case 'swapped':  p[pos] = picks(pos, [2,1,3,4,5,6,7,8,9,10].map(n => `${pre}${n}`)); break
      case 'half':     p[pos] = picks(pos, [...[1,2,3,4,5].map(n => `${pre}${n}`), ...['m1','m2','m3','m4','m5']]); break
      case 'reversed': p[pos] = picks(pos, [10,9,8,7,6,5,4,3,2,1].map(n => `${pre}${n}`)); break
      case 'miss':     p[pos] = picks(pos, ['m1','m2','m3','m4','m5','m6','m7','m8','m9','m10']); break
    }
  }
  return p
}

// ─── Full pipeline run helper ─────────────────────────────────────────────────

interface UserEntry { userId: string; picks: Record<Pos, RankingRow[]> }

interface RunPipelineOpts {
  /** Simulate a Sleeper API / DB batch failure during stats sync */
  statsError?: string
}

/**
 * Mirrors pipeline.ts orchestrator logic:
 *   - Aborts if concurrent job is running (db.jobRunning)
 *   - Aborts after stats sync if syncResult.errors.length > 0
 *   - Returns { aborted, reason } when either guard triggers
 */
function runPipeline(
  db: SimDB,
  week: number,
  stats: RawStatRow[],
  userEntries: UserEntry[],
  opts?: RunPipelineOpts,
): {
  syncResult: ReturnType<typeof syncStats>
  gt?: Record<Pos, GroundTruthEntry[]>
  scored?: Record<string, EntryScore>
  rankings?: ReturnType<typeof rankAll>
  aborted?: boolean
  abortReason?: string
} {
  // Concurrent-run lock (mirrors pipeline.ts guard)
  if (db.jobRunning) {
    return { syncResult: { upserted: 0, skipped: 0, errors: [] }, aborted: true, abortReason: 'concurrent-run lock' }
  }

  // Register oracle_entries (idempotent: only inserts once per user)
  for (const u of userEntries) db.registerEntry(u.userId)

  db.jobRunning = true
  try {
    // Stage 1: stats sync
    const syncResult = syncStats(db, week, stats, { simulateError: opts?.statsError })

    // SAFETY ABORT: if stats sync produced errors, stop here (mirrors pipeline.ts guard)
    if (syncResult.errors.length > 0) {
      return { syncResult, aborted: true, abortReason: `stats-sync: ${syncResult.errors[0]}` }
    }

    // Stage 2: ground truth
    const gt = buildGroundTruth(db, week)

    // Stages 3+4: score all users
    const scored: Record<string, EntryScore> = {}
    for (const u of userEntries) {
      scored[u.userId] = scoreUser(db, u.userId, u.picks, gt)
    }

    // Stage 5: rank
    const rankings = rankAll(db, week)

    return { syncResult, gt, scored, rankings }
  } finally {
    db.jobRunning = false
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const USERS: UserEntry[] = [
  { userId: 'alice', picks: positionPicks('perfect')  },  // entry #1
  { userId: 'bob',   picks: positionPicks('swapped')  },  // entry #2
  { userId: 'carol', picks: positionPicks('miss')     },  // entry #3
  { userId: 'dave',  picks: positionPicks('half')     },  // entry #4
  { userId: 'eve',   picks: positionPicks('reversed') },  // entry #5
]

describe('Stage 1: Stats Sync — Week 1', () => {
  it('upserts 44 oracle rows and skips 3 non-oracle/zero-point rows', () => {
    const db = new SimDB()
    const { upserted, skipped } = syncStats(db, 1, WEEK1_STATS)
    // 11 players × 4 positions = 44 valid rows
    // K, DEF, and rb_inactive (ppr=0) are skipped
    expect(upserted).toBe(44)
    expect(skipped).toBe(3)
    expect(db.statsCount()).toBe(44)
  })

  it('stores each player keyed by week:player_id (unique constraint)', () => {
    const db = new SimDB()
    syncStats(db, 1, WEEK1_STATS)
    // qb1 week 1 must be present
    expect(db.playerStats.has('1:qb1')).toBe(true)
    expect(db.playerStats.get('1:qb1')!.ppr_points).toBe(38.2)
    // #11 player (qb11) must also be present — will be excluded at GT stage
    expect(db.playerStats.has('1:qb11')).toBe(true)
  })
})

describe('Stage 2: Ground Truth Builder — Week 1', () => {
  let db: SimDB
  let gt: Record<Pos, GroundTruthEntry[]>

  beforeEach(() => {
    db = new SimDB()
    syncStats(db, 1, WEEK1_STATS)
    gt = buildGroundTruth(db, 1)
  })

  it('QB top-10 sorted by PPR descending, qb11 excluded', () => {
    expect(gt.QB).toHaveLength(10)
    expect(gt.QB[0].playerId).toBe('qb1')
    expect(gt.QB[0].rank).toBe(1)
    expect(gt.QB[0].pprPoints).toBe(38.2)
    expect(gt.QB[9].playerId).toBe('qb10')
    expect(gt.QB[9].rank).toBe(10)
    // qb11 must not appear
    expect(gt.QB.find(p => p.playerId === 'qb11')).toBeUndefined()
  })

  it('produces top-10 for all 4 positions', () => {
    for (const pos of POSITIONS) {
      expect(gt[pos]).toHaveLength(10)
      expect(gt[pos][0].rank).toBe(1)
      expect(gt[pos][9].rank).toBe(10)
    }
  })
})

describe('Stage 3: Score Oracle Entries — Week 1', () => {
  let db: SimDB
  let gt: Record<Pos, GroundTruthEntry[]>

  beforeEach(() => {
    db = new SimDB()
    syncStats(db, 1, WEEK1_STATS)
    gt = buildGroundTruth(db, 1)
  })

  it('perfect picks score 100 overall, 40 hits, 0 rank error', () => {
    const result = scoreEntry(positionPicks('perfect'), gt)
    expect(result.overallScore).toBe(100)
    expect(result.top10Hits).toBe(40)
    expect(result.totalRankError).toBe(0)
  })

  it('top-2 swapped scores 98 (two players off by 1, rest exact)', () => {
    const result = scoreEntry(positionPicks('swapped'), gt)
    // per position: 9+9+10×8 = 98; overall = (98×4)/4 = 98
    expect(result.overallScore).toBe(98)
    expect(result.top10Hits).toBe(40)
    expect(result.totalRankError).toBe(8)   // 2 per position × 4
  })

  it('top-5 exact, bottom-5 miss scores 50 overall, 20 hits, 0 rank error', () => {
    const result = scoreEntry(positionPicks('half'), gt)
    expect(result.overallScore).toBe(50)
    expect(result.top10Hits).toBe(20)
    expect(result.totalRankError).toBe(0)
  })

  it('reversed order scores 50 overall, 40 hits, 200 rank error', () => {
    const result = scoreEntry(positionPicks('reversed'), gt)
    // per position: 1+3+5+7+9+9+7+5+3+1 = 50; error = 9+7+5+3+1+1+3+5+7+9 = 50
    expect(result.overallScore).toBe(50)
    expect(result.top10Hits).toBe(40)
    expect(result.totalRankError).toBe(200)
  })

  it('all misses score 0 overall, 0 hits, 0 rank error', () => {
    const result = scoreEntry(positionPicks('miss'), gt)
    expect(result.overallScore).toBe(0)
    expect(result.top10Hits).toBe(0)
    expect(result.totalRankError).toBe(0)
  })
})

describe('Stage 4+5: Leaderboard + Rank Movement — Week 1', () => {
  let db: SimDB
  let rankings: ReturnType<typeof rankAll>

  beforeEach(() => {
    db = new SimDB()
    const result = runPipeline(db, 1, WEEK1_STATS, USERS)
    rankings = result.rankings
  })

  it('produces correct rank order per tiebreaker chain', () => {
    const byUserId = Object.fromEntries(rankings.map(r => [r.userId, r]))
    expect(byUserId['alice'].rank).toBe(1)   // score=100
    expect(byUserId['bob'].rank).toBe(2)     // score=98
    expect(byUserId['eve'].rank).toBe(3)     // score=50, hits=40 > dave's hits=20
    expect(byUserId['dave'].rank).toBe(4)    // score=50, hits=20
    expect(byUserId['carol'].rank).toBe(5)   // score=0
  })

  it('eve beats dave on equal score due to more top-10 hits (40 > 20)', () => {
    const eve = rankings.find(r => r.userId === 'eve')!
    const dave = rankings.find(r => r.userId === 'dave')!
    expect(eve.score).toBe(dave.score)        // equal scores
    expect(db.scores.get('eve')!.top10_hits).toBeGreaterThan(db.scores.get('dave')!.top10_hits)
    expect(eve.rank).toBeLessThan(dave.rank)  // eve ranks higher
  })

  it('all 5 users have rank_change=null on first run (no prior rank)', () => {
    for (const r of rankings) {
      expect(r.prevRank).toBeNull()
      expect(r.rankChange).toBeNull()
    }
  })
})

describe('Idempotency — running Week 1 pipeline twice', () => {
  it('produces identical scores, rankings, and DB row counts on second run', () => {
    const db = new SimDB()

    // First run
    const run1 = runPipeline(db, 1, WEEK1_STATS, USERS)

    // Snapshot state after first run
    const statsCountAfterRun1 = db.statsCount()
    const aliceScoreRun1 = db.scores.get('alice')!
    const rankingsRun1 = run1.rankings.map(r => ({ userId: r.userId, rank: r.rank }))

    // Second run — same week, same data
    const run2 = runPipeline(db, 1, WEEK1_STATS, USERS)

    // Stats store must not grow (upsert overwrites, no duplicates)
    expect(db.statsCount()).toBe(statsCountAfterRun1)

    // Scores must be identical
    const aliceScoreRun2 = db.scores.get('alice')!
    expect(aliceScoreRun2.overall_score).toBe(aliceScoreRun1.overall_score)
    expect(aliceScoreRun2.top10_hits).toBe(aliceScoreRun1.top10_hits)
    expect(aliceScoreRun2.total_rank_error).toBe(aliceScoreRun1.total_rank_error)

    // Rankings must be identical
    const rankingsRun2 = run2.rankings.map(r => ({ userId: r.userId, rank: r.rank }))
    expect(rankingsRun2).toEqual(rankingsRun1)

    // entry_numbers must not change (oracle_entries is insert-once)
    expect(db.entries.get('alice')).toBe(1)
    expect(db.entries.get('bob')).toBe(2)
  })
})

describe('Failure Recovery — partial failure + rerun', () => {
  it('rescores failed user correctly without affecting other scores', () => {
    const db = new SimDB()
    syncStats(db, 1, WEEK1_STATS)
    const gt = buildGroundTruth(db, 1)

    // Register all entries first
    for (const u of USERS) db.registerEntry(u.userId)

    // Stage 3 fails for alice (simulate: score everyone except alice)
    const usersExcludingAlice = USERS.filter(u => u.userId !== 'alice')
    for (const u of usersExcludingAlice) scoreUser(db, u.userId, u.picks, gt)
    rankAll(db, 1)

    // Alice has no score yet
    expect(db.scores.has('alice')).toBe(false)

    // Capture bob's score before recovery
    const bobScoreBefore = db.scores.get('bob')!.overall_score

    // Recovery run — re-run pipeline for all users
    for (const u of USERS) scoreUser(db, u.userId, u.picks, gt)
    const rankings = rankAll(db, 1)

    // Alice now has the correct score
    expect(db.scores.get('alice')!.overall_score).toBe(100)

    // Bob's score is unchanged (upsert overwrites with same value)
    expect(db.scores.get('bob')!.overall_score).toBe(bobScoreBefore)

    // No extra rows created — still exactly 5 users
    expect(db.scores.size).toBe(5)

    // Rankings are correct after recovery
    const byUserId = Object.fromEntries(rankings.map(r => [r.userId, r]))
    expect(byUserId['alice'].rank).toBe(1)
  })
})

describe('Catch-up Run — out-of-order pipeline execution', () => {
  it('Week 2 cumulative GT is identical whether or not Week 1 pipeline ran first', () => {
    // Both DBs receive the same player stats for weeks 1 and 2
    // DB A: ran Week 1 pipeline (GT was built at week 1), then Week 2 pipeline
    // DB B: Week 1 pipeline was skipped, but Week 1 stats are still in player_stats
    //        Then Week 2 pipeline runs (catch-up)
    // In both cases, buildGroundTruth(upToWeek=2) reads cumulative weeks 1+2

    const dbA = new SimDB()
    syncStats(dbA, 1, WEEK1_STATS)
    buildGroundTruth(dbA, 1)     // Week 1 pipeline ran — wrote GT for week 1
    syncStats(dbA, 2, WEEK2_STATS)
    const gtA = buildGroundTruth(dbA, 2)   // Week 2 pipeline — cumulative

    const dbB = new SimDB()
    syncStats(dbB, 1, WEEK1_STATS)
    // Week 1 pipeline did NOT run (no buildGroundTruth call at week 1)
    syncStats(dbB, 2, WEEK2_STATS)
    const gtB = buildGroundTruth(dbB, 2)   // Week 2 pipeline — cumulative catch-up

    // Ground truth must be identical since player_stats is the same
    for (const pos of POSITIONS) {
      expect(gtB[pos].map(p => p.playerId)).toEqual(gtA[pos].map(p => p.playerId))
      expect(gtB[pos].map(p => p.pprPoints)).toEqual(gtA[pos].map(p => p.pprPoints))
    }
  })

  it('qb2 overtakes qb1 in cumulative PPR after Week 2, shifting GT rank', () => {
    const db = new SimDB()
    syncStats(db, 1, WEEK1_STATS)
    syncStats(db, 2, WEEK2_STATS)
    const gt = buildGroundTruth(db, 2)

    // Week 1 only: qb1=38.2, qb2=35.6 → qb1 is #1
    // Week 2: qb1 cumulative=38.2+(38.2-10)=66.4, qb2 cumulative=35.6+(35.6+10)=81.2
    // So qb2 overtakes qb1 after week 2
    expect(gt.QB[0].playerId).toBe('qb2')   // qb2 now #1
    expect(gt.QB[1].playerId).toBe('qb1')   // qb1 now #2
    expect(gt.QB[0].pprPoints).toBeGreaterThan(gt.QB[1].pprPoints)
  })

  it('user scores update correctly when GT shifts — alice drops, bob rises', () => {
    // Alice picks: qb1 at #1, qb2 at #2 (was perfect at week 1)
    // Bob   picks: qb2 at #1, qb1 at #2 (was off-by-1 at week 1)
    // After week 2: qb2 is the real #1 — bob is now perfect on QB, alice is off-by-1

    const db = new SimDB()
    syncStats(db, 1, WEEK1_STATS)
    syncStats(db, 2, WEEK2_STATS)
    const gt2 = buildGroundTruth(db, 2)

    for (const u of USERS) db.registerEntry(u.userId)

    const alice2 = scoreEntry(positionPicks('perfect'), gt2)
    const bob2   = scoreEntry(positionPicks('swapped'), gt2)

    // QB component only changes; other 3 positions unchanged
    // Alice QB after week 2: qb1@#1 actual now #2 → dist=1 → 9pts; qb2@#2 actual now #1 → dist=1 → 9pts; rest exact
    //   QB pos score = 98 (was 100)
    // Bob QB after week 2: qb2@#1 actual now #1 → 10pts; qb1@#2 actual now #2 → 10pts; rest exact
    //   QB pos score = 100 (was 98)
    expect(alice2.positions.QB.score).toBe(98)   // dropped 2 pts
    expect(bob2.positions.QB.score).toBe(100)    // perfect now

    // Overall: alice = (98+100+100+100)/4 = 99.5; bob = (100+98+98+98)/4 = 98.5
    expect(alice2.overallScore).toBe(99.5)
    expect(bob2.overallScore).toBe(98.5)

    // Alice still leads overall but lead is narrower
    expect(alice2.overallScore).toBeGreaterThan(bob2.overallScore)
  })

  it('late stat correction — re-running with updated PPR changes scores correctly', () => {
    // Simulate a common scenario: Sleeper posts corrected stats after scoring already ran.
    // The pipeline must be re-runnable and produce updated (not additive) scores.

    const db = new SimDB()
    for (const u of USERS) db.registerEntry(u.userId)

    // Initial Week 1 run: qb1 posted with wrong points (30.0 instead of 38.2)
    const WEEK1_WRONG = WEEK1_STATS.map(r =>
      r.player_id === 'qb1' ? { ...r, ppr_points: 30.0 } : r
    )
    syncStats(db, 1, WEEK1_WRONG)
    const gt_wrong = buildGroundTruth(db, 1)
    for (const u of USERS) scoreUser(db, u.userId, u.picks, gt_wrong)
    rankAll(db, 1)

    // qb1 was ranked correctly at #1 by alice — but PPR is wrong, so score is same
    // (rank order unchanged since qb1 is still highest even at 30.0)
    const aliceBeforeCorrection = db.scores.get('alice')!.overall_score

    // Correction run: Sleeper updates qb1 to 38.2; upsert overwrites the row
    // (UNIQUE week:player_id → Map.set() replaces the existing entry)
    const correctedStat: RawStatRow = {
      player_id: 'qb1', player_name: 'QB Player 1', position: 'QB', ppr_points: 38.2,
    }
    syncStats(db, 1, [correctedStat])

    // Stat row must be updated, not duplicated
    expect(db.statsCount()).toBe(44) // still 44 rows — no new row added
    expect(db.playerStats.get('1:qb1')!.ppr_points).toBe(38.2)

    // Re-run GT + scoring with corrected data
    const gt_corrected = buildGroundTruth(db, 1)
    for (const u of USERS) scoreUser(db, u.userId, u.picks, gt_corrected)
    rankAll(db, 1)

    // qb1 PPR is now correct: alice's score must equal the original perfect score
    expect(db.scores.get('alice')!.overall_score).toBe(100)

    // Scores are upserted (overwritten), not accumulated
    expect(db.scores.size).toBe(5) // still exactly 5 users

    // Rank order is same as original correct run
    const byUserId = Object.fromEntries([...db.scores.entries()].map(([uid, s]) => [uid, s]))
    expect(byUserId['alice'].global_rank).toBe(1)
    expect(byUserId['bob'].global_rank).toBe(2)
  })

  it('catch-up produces correct final standings — same as on-schedule run', () => {
    // Both DBs run Week 1 and Week 2, just in different order relative to GT build
    const dbA = new SimDB()
    const dbB = new SimDB()

    // DB A: on-schedule (ran both weekly pipelines)
    runPipeline(dbA, 1, WEEK1_STATS, USERS)
    runPipeline(dbA, 2, WEEK2_STATS, USERS)

    // DB B: same stats loaded, but Week 1 GT was never written
    // (catch-up: only Week 2 pipeline ran, but Week 1 stats exist in player_stats)
    for (const u of USERS) dbB.registerEntry(u.userId)
    syncStats(dbB, 1, WEEK1_STATS)
    syncStats(dbB, 2, WEEK2_STATS)
    const gt2B = buildGroundTruth(dbB, 2)
    for (const u of USERS) scoreUser(dbB, u.userId, u.picks, gt2B)
    const rankingsB = rankAll(dbB, 2)

    const rankingsA = [...dbA.scores.entries()].map(([userId, s]) => ({
      userId,
      score: s.overall_score,
      rank: s.global_rank,
    })).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))

    const rankingsB2 = rankingsB.map(r => ({ userId: r.userId, score: r.score }))

    // Rank order must be identical in both scenarios
    for (let i = 0; i < rankingsA.length; i++) {
      expect(rankingsB2[i].userId).toBe(rankingsA[i].userId)
      expect(rankingsB2[i].score).toBe(rankingsA[i].score)
    }
  })
})

describe('PPR Ties — deterministic ground truth ordering', () => {
  it('two players with identical PPR are ranked alphabetically by player_id (stable)', () => {
    // Create two QB players with exactly equal PPR points
    const db = new SimDB()
    const tiedStats: RawStatRow[] = [
      // qb_alpha and qb_beta tied at 30.0 — should always resolve alpha < beta
      { player_id: 'qb_alpha', player_name: 'Alpha QB', position: 'QB', ppr_points: 30.0 },
      { player_id: 'qb_beta',  player_name: 'Beta QB',  position: 'QB', ppr_points: 30.0 },
      // 8 more QBs to fill the top-10
      ...([3,4,5,6,7,8,9,10]).map(n => ({
        player_id: `qb${n}`, player_name: `QB ${n}`, position: 'QB', ppr_points: 40 - n,
      })),
      // Placeholder RB/WR/TE so GT doesn't error on missing positions
      { player_id: 'rb1', player_name: 'RB 1', position: 'RB', ppr_points: 20.0 },
      { player_id: 'wr1', player_name: 'WR 1', position: 'WR', ppr_points: 20.0 },
      { player_id: 'te1', player_name: 'TE 1', position: 'TE', ppr_points: 20.0 },
    ]

    syncStats(db, 1, tiedStats)
    const gt = buildGroundTruth(db, 1)

    const alphaEntry = gt.QB.find(p => p.playerId === 'qb_alpha')
    const betaEntry  = gt.QB.find(p => p.playerId === 'qb_beta')

    // Both must appear in the top-10
    expect(alphaEntry).toBeDefined()
    expect(betaEntry).toBeDefined()

    // qb_alpha < qb_beta alphabetically → alpha gets the lower rank number (higher position)
    expect(alphaEntry!.rank).toBeLessThan(betaEntry!.rank)
  })

  it('running GT twice with tied players produces the same ranking both times', () => {
    const tiedStats: RawStatRow[] = [
      { player_id: 'qb_z', player_name: 'Z QB', position: 'QB', ppr_points: 30.0 },
      { player_id: 'qb_a', player_name: 'A QB', position: 'QB', ppr_points: 30.0 },
      ...([3,4,5,6,7,8,9,10]).map(n => ({
        player_id: `qb${n}`, player_name: `QB ${n}`, position: 'QB', ppr_points: 40 - n,
      })),
      { player_id: 'rb1', player_name: 'RB 1', position: 'RB', ppr_points: 20.0 },
      { player_id: 'wr1', player_name: 'WR 1', position: 'WR', ppr_points: 20.0 },
      { player_id: 'te1', player_name: 'TE 1', position: 'TE', ppr_points: 20.0 },
    ]

    const db1 = new SimDB()
    const db2 = new SimDB()
    syncStats(db1, 1, tiedStats)
    syncStats(db2, 1, tiedStats)

    const gt1 = buildGroundTruth(db1, 1)
    const gt2 = buildGroundTruth(db2, 1)

    // Must produce identical ordering on both runs
    expect(gt1.QB.map(p => p.playerId)).toEqual(gt2.QB.map(p => p.playerId))
    expect(gt1.QB.map(p => p.rank)).toEqual(gt2.QB.map(p => p.rank))

    // qb_a comes before qb_z alphabetically
    const aIdx = gt1.QB.findIndex(p => p.playerId === 'qb_a')
    const zIdx = gt1.QB.findIndex(p => p.playerId === 'qb_z')
    expect(aIdx).toBeLessThan(zIdx)
  })
})

describe('Missing pts_ppr — null and zero-point rows are excluded', () => {
  it('rows with ppr_points=0 are skipped at sync stage and do not appear in GT', () => {
    const db = new SimDB()
    const statsWithZeros: RawStatRow[] = [
      ...WEEK1_STATS,
      // Extra zero-point QBs — must not pollute GT
      { player_id: 'qb_dnp1', player_name: 'DNP QB 1', position: 'QB', ppr_points: 0 },
      { player_id: 'qb_dnp2', player_name: 'DNP QB 2', position: 'QB', ppr_points: 0 },
    ]

    const { upserted, skipped } = syncStats(db, 1, statsWithZeros)

    // The 2 extra zero-point rows must be skipped (plus the 3 original skips = 5 total)
    expect(skipped).toBe(5)
    expect(upserted).toBe(44)

    const gt = buildGroundTruth(db, 1)
    // Zero-point QBs must not appear in GT
    expect(gt.QB.find(p => p.playerId === 'qb_dnp1')).toBeUndefined()
    expect(gt.QB.find(p => p.playerId === 'qb_dnp2')).toBeUndefined()
    // GT still has exactly 10 QBs
    expect(gt.QB).toHaveLength(10)
  })

  it('week where all players score 0 produces empty GT for that position', () => {
    // Edge case: bye week or game cancellation wipes out all stats for a position
    const db = new SimDB()
    const noQBPoints: RawStatRow[] = [
      { player_id: 'qb1', player_name: 'QB 1', position: 'QB', ppr_points: 0 },
      { player_id: 'rb1', player_name: 'RB 1', position: 'RB', ppr_points: 20.0 },
      { player_id: 'wr1', player_name: 'WR 1', position: 'WR', ppr_points: 20.0 },
      { player_id: 'te1', player_name: 'TE 1', position: 'TE', ppr_points: 20.0 },
    ]

    syncStats(db, 1, noQBPoints)
    const gt = buildGroundTruth(db, 1)

    // QB GT is empty — no rows survived the filter
    expect(gt.QB).toHaveLength(0)
    // Other positions still populated
    expect(gt.RB.length).toBeGreaterThan(0)
  })

  it('player missing from one week is still scored correctly from cumulative total', () => {
    // Player qb1 has no stats in Week 2 (injured/bye) but scored Week 1
    // Their cumulative total after Week 2 must equal only their Week 1 points
    const db = new SimDB()
    syncStats(db, 1, WEEK1_STATS)

    // Week 2 stats — qb1 is absent (not even in the raw payload)
    const week2NoQB1 = WEEK2_STATS.filter(r => r.player_id !== 'qb1')
    syncStats(db, 2, week2NoQB1)

    const gt = buildGroundTruth(db, 2)

    // qb1's cumulative total is just their Week 1 score (38.2)
    const qb1Entry = gt.QB.find(p => p.playerId === 'qb1')
    expect(qb1Entry).toBeDefined()
    expect(qb1Entry!.pprPoints).toBe(38.2)
  })
})

describe('Interrupted Import — partial batch failure + recovery', () => {
  it('partial sync failure leaves consistent state and full re-run completes correctly', () => {
    // Simulate: stats for QB and RB were loaded, but WR/TE sync was interrupted.
    // On re-run, all 4 positions are synced. Final state must be correct.

    const db = new SimDB()
    for (const u of USERS) db.registerEntry(u.userId)

    // Partial sync: only QB and RB make it through before failure
    const partialStats = WEEK1_STATS.filter(r => r.position === 'QB' || r.position === 'RB')
    const { upserted: firstBatch } = syncStats(db, 1, partialStats)
    expect(firstBatch).toBe(22) // 11 QB + 11 RB

    // GT built on partial data — WR/TE are empty
    const gtPartial = buildGroundTruth(db, 1)
    expect(gtPartial.QB).toHaveLength(10)
    expect(gtPartial.RB).toHaveLength(10)
    expect(gtPartial.WR).toHaveLength(0) // not synced yet
    expect(gtPartial.TE).toHaveLength(0) // not synced yet

    // Recovery: full re-run with all positions
    // QB+RB rows already exist → upsert overwrites them (no duplicates)
    const { upserted: secondBatch } = syncStats(db, 1, WEEK1_STATS)
    // All 44 rows processed, but only WR/TE (22) are net-new; QB/RB rows overwrite
    // Total DB row count is still 44 (upsert = no duplication)
    expect(db.statsCount()).toBe(44)

    // GT after full sync is correct
    const gtFull = buildGroundTruth(db, 1)
    expect(gtFull.WR).toHaveLength(10)
    expect(gtFull.TE).toHaveLength(10)

    // Score all users against the correct GT
    for (const u of USERS) scoreUser(db, u.userId, u.picks, gtFull)
    const rankings = rankAll(db, 1)

    // Alice (perfect picks) must still rank #1
    const alice = rankings.find(r => r.userId === 'alice')!
    expect(alice.rank).toBe(1)
    expect(db.scores.get('alice')!.overall_score).toBe(100)

    // Scores must not be inflated/accumulated from the partial run
    expect(db.scores.size).toBe(5)
  })

  it('duplicate sync run after partial failure does not double-count PPR', () => {
    // If the scheduler retries and sends Week 1 stats twice,
    // cumulative totals must not be doubled.
    const db = new SimDB()

    // First sync
    syncStats(db, 1, WEEK1_STATS)
    // Second sync (retry) — exact same payload
    syncStats(db, 1, WEEK1_STATS)

    // Stats store must still be exactly 44 rows (UNIQUE week:player_id)
    expect(db.statsCount()).toBe(44)

    // GT must show the original PPR totals, not 2× totals
    const gt = buildGroundTruth(db, 1)
    expect(gt.QB[0].pprPoints).toBe(38.2)  // not 76.4
    expect(gt.RB[0].pprPoints).toBe(42.3)  // not 84.6
  })
})

describe('Pipeline Guard — stats sync failure aborts scoring', () => {
  it('aborts the pipeline and writes no scores when Sleeper fetch fails', () => {
    const db = new SimDB()

    // First run Week 1 correctly so there are valid scores to preserve
    runPipeline(db, 1, WEEK1_STATS, USERS)
    const scoresBeforeFailure = new Map(db.scores)
    const statsCountBeforeFailure = db.statsCount()

    // Week 2: Sleeper returns a 503 — syncStats produces 0 rows + an error
    const result = runPipeline(db, 2, WEEK1_STATS, USERS, {
      statsError: 'HTTP 503: Sleeper unavailable',
    })

    // Pipeline must abort
    expect(result.aborted).toBe(true)
    expect(result.abortReason).toContain('stats-sync')

    // Ground truth must NOT have been rebuilt (no stage 2 ran)
    expect(result.gt).toBeUndefined()

    // No scoring happened — scores map must be identical to before the failed run
    expect(db.scores.size).toBe(scoresBeforeFailure.size)
    for (const [userId, score] of scoresBeforeFailure) {
      expect(db.scores.get(userId)!.overall_score).toBe(score.overall_score)
      expect(db.scores.get(userId)!.global_rank).toBe(score.global_rank)
    }

    // Stats table must not have grown (no rows from failed week 2)
    expect(db.statsCount()).toBe(statsCountBeforeFailure)

    // jobRunning must be released (lock cleaned up even on abort)
    expect(db.jobRunning).toBe(false)
  })

  it('aborts even if some stats were written before the batch error', () => {
    // Real scenario: first 100-row batch succeeds, second fails.
    // Pipeline should abort — partial stats are worse than no new stats.
    const db = new SimDB()

    // Simulate: syncStats returned errors (some batches failed)
    const result = runPipeline(db, 1, WEEK1_STATS, USERS, {
      statsError: 'Supabase upsert batch failed: connection timeout',
    })

    expect(result.aborted).toBe(true)
    expect(result.gt).toBeUndefined()      // stage 2 never ran
    expect(result.scored).toBeUndefined()  // stage 3 never ran
    expect(db.scores.size).toBe(0)         // no scores written
    expect(db.jobRunning).toBe(false)      // lock always released
  })

  it('does NOT abort when stats sync succeeds with zero errors', () => {
    // Pre-season sanity: upserted=0 with no errors is valid (no games yet)
    const db = new SimDB()

    // Empty stats — no games this week — should NOT trigger the abort guard
    const result = runPipeline(db, 1, [], USERS)

    // Pipeline ran all stages; no abort
    expect(result.aborted).toBeUndefined()
    expect(result.gt).toBeDefined()

    // All positions have empty GT (no stats = no top-10)
    expect(result.gt!.QB).toHaveLength(0)
    expect(result.gt!.RB).toHaveLength(0)

    // Scoring ran but produced 0 points for everyone (empty GT)
    expect(result.scored).toBeDefined()
    expect(result.scored!['alice'].overallScore).toBe(0)
    expect(db.jobRunning).toBe(false)
  })
})

describe('Pipeline Guard — concurrent-run lock', () => {
  it('rejects a second invocation while a job is already running', () => {
    const db = new SimDB()

    // Simulate: a pipeline run is in progress (db.jobRunning = true)
    db.jobRunning = true

    const result = runPipeline(db, 1, WEEK1_STATS, USERS)

    // Second invocation must be rejected immediately
    expect(result.aborted).toBe(true)
    expect(result.abortReason).toContain('concurrent-run lock')

    // No stages ran — nothing was written
    expect(db.statsCount()).toBe(0)
    expect(db.scores.size).toBe(0)
  })

  it('releases the lock after a successful run so the next run proceeds', () => {
    const db = new SimDB()

    // First run: completes normally
    const run1 = runPipeline(db, 1, WEEK1_STATS, USERS)
    expect(run1.aborted).toBeUndefined()
    expect(db.jobRunning).toBe(false)  // lock released

    // Second run: must not be blocked
    const run2 = runPipeline(db, 1, WEEK1_STATS, USERS)
    expect(run2.aborted).toBeUndefined()
    expect(db.scores.size).toBe(5)
  })

  it('releases the lock even if the pipeline aborts due to stats failure', () => {
    const db = new SimDB()

    // Run that fails at stats stage
    const result = runPipeline(db, 1, WEEK1_STATS, USERS, {
      statsError: 'HTTP 503',
    })
    expect(result.aborted).toBe(true)
    expect(db.jobRunning).toBe(false)  // lock must be released even on abort

    // Subsequent run must not be blocked by the stale lock
    const recovery = runPipeline(db, 1, WEEK1_STATS, USERS)
    expect(recovery.aborted).toBeUndefined()
    expect(db.scores.size).toBe(5)
  })
})
