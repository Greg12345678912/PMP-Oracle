import { getServiceClient } from '@/lib/league/db'
import type { OraclePosition } from './constants'
import { ORACLE_POSITIONS } from './constants'
import { getRankings } from './rankings'

// ─── Public result types ────────────────────────────────────────────────────
// NOTE: Scoring algorithm is pending approval. These types are placeholders
// that will be replaced when the algorithm is finalized.

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

/** Fetch ground truth for a position and return a map of playerId → actualRank. */
async function getGroundTruth(
  seasonId: string,
  position: OraclePosition,
): Promise<Map<string, number>> {
  const db = getServiceClient()
  const { data } = await db
    .from('ground_truth')
    .select('player_id, rank')
    .eq('season_id', seasonId)
    .eq('position', position)
  const map = new Map<string, number>()
  ;(data ?? []).forEach((r: { player_id: string; rank: number }) =>
    map.set(r.player_id, r.rank),
  )
  return map
}

interface PositionScoreDetail {
  playerId: string
  playerName: string
  userRank: number
  actualRank: number | null
  distance: number | null
  finalScore: number
}

interface PositionScore {
  normalized: number  // 0–100, placeholder until algorithm approved
  detail: PositionScoreDetail[]
}

// TODO: Replace with approved scoring algorithm before activating recalculation.
export async function scorePosition(
  userId: string,
  seasonId: string,
  position: OraclePosition,
): Promise<PositionScore> {
  const [rows, truthMap] = await Promise.all([
    getRankings(userId, seasonId, position),
    getGroundTruth(seasonId, position),
  ])

  const detail = rows.map(row => {
    const actualRank = truthMap.get(row.playerId) ?? null
    const distance = actualRank != null ? Math.abs(row.playerRank - actualRank) : null
    return {
      playerId: row.playerId,
      playerName: row.playerName,
      userRank: row.playerRank,
      actualRank,
      distance,
      finalScore: 0, // placeholder — algorithm pending
    }
  })

  return { normalized: 0, detail }
}

// TODO: Wire up once scoring algorithm is approved.
export async function scoreUser(userId: string, seasonId: string): Promise<void> {
  const db = getServiceClient()

  const positionResults = await Promise.all(
    ORACLE_POSITIONS.map(pos => scorePosition(userId, seasonId, pos)),
  )

  const [qb, rb, wr, te] = positionResults.map(r => r.normalized)
  const overall = Math.round(((qb + rb + wr + te) / 4) * 10) / 10

  await db.from('accuracy_scores').upsert(
    {
      user_id: userId,
      season_id: seasonId,
      score_qb: qb,
      score_rb: rb,
      score_wr: wr,
      score_te: te,
      overall_score: overall,
      is_projected: false,
      computed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,season_id' },
  )

  for (let i = 0; i < ORACLE_POSITIONS.length; i++) {
    const position = ORACLE_POSITIONS[i]
    const { detail } = positionResults[i]
    for (const d of detail) {
      await db.from('ranking_score_detail').upsert(
        {
          user_id: userId,
          season_id: seasonId,
          position,
          player_id: d.playerId,
          player_name: d.playerName,
          user_rank: d.userRank,
          actual_rank: d.actualRank,
          distance: d.distance,
          final_score: d.finalScore,
        },
        { onConflict: 'user_id,season_id,position,player_id' },
      )
    }
  }
}

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
