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

  // Defensive guard: duplicate playerIds in stored rankings would distort
  // scores silently. This should never happen if validateRankings ran at
  // submission, but we check again here to prevent bad data from propagating.
  for (const pos of ORACLE_POSITIONS) {
    const ids = picks[pos].map(r => r.playerId)
    if (new Set(ids).size !== ids.length) {
      throw new Error(`Duplicate player IDs in ${pos} rankings for user ${userId} — scoring aborted`)
    }
  }

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

    const detailRows = ORACLE_POSITIONS.flatMap(pos =>
      entry.positions[pos].details.map(d => ({
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
      })),
    )
    await db
      .from('ranking_score_detail')
      .upsert(detailRows, { onConflict: 'user_id,season_id,position,player_id' })
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
