import { getServiceClient } from '@/lib/league/db'
import type { OraclePosition } from './constants'
import { ORACLE_POSITIONS, POSITION_LIST_SIZE } from './constants'
import { getRankings } from './rankings'

/** Points for a given distance from the correct rank (stepped, 50 → 0). */
export function scoreRankings(userRank: number, actualRank: number | null): number {
  if (actualRank == null) return 0
  const distance = Math.abs(userRank - actualRank)
  if (distance >= 10) return 0
  return 50 - distance * 5
}

/**
 * Apply confidence multiplier.
 *   High:   ×1.5 if rawScore ≥ 30; ×0.5 otherwise
 *   Medium: ×1.2 if rawScore ≥ 30; ×0.8 otherwise
 *   Low:    no modifier
 */
export function applyConfidence(
  rawScore: number,
  confidence: 'low' | 'medium' | 'high',
  distance: number,
): number {
  if (confidence === 'low') return rawScore
  const isStrong = rawScore >= 30
  const multiplier = confidence === 'high'
    ? (isStrong ? 1.5 : 0.5)
    : (isStrong ? 1.2 : 0.8)
  return Math.round(rawScore * multiplier)
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
  rawScore: number
  confidence: string
  finalScore: number
}

interface PositionScore {
  normalized: number  // 0–100
  detail: PositionScoreDetail[]
}

export async function scorePosition(
  userId: string,
  seasonId: string,
  position: OraclePosition,
): Promise<PositionScore> {
  const [rows, truthMap] = await Promise.all([
    getRankings(userId, seasonId, position),
    getGroundTruth(seasonId, position),
  ])

  const maxPossible = POSITION_LIST_SIZE[position] * 50
  let totalFinal = 0

  const detail = rows.map(row => {
    const actualRank = truthMap.get(row.playerId) ?? null
    const distance = actualRank != null ? Math.abs(row.playerRank - actualRank) : null
    const rawScore = scoreRankings(row.playerRank, actualRank)
    const finalScore = applyConfidence(rawScore, row.confidence, distance ?? 99)
    totalFinal += finalScore
    return {
      playerId: row.playerId,
      playerName: row.playerName,
      userRank: row.playerRank,
      actualRank,
      distance,
      rawScore,
      confidence: row.confidence,
      finalScore,
    }
  })

  const normalized =
    maxPossible > 0 ? Math.round((totalFinal / maxPossible) * 1000) / 10 : 0
  return { normalized, detail }
}

export async function scoreUser(userId: string, seasonId: string): Promise<void> {
  const db = getServiceClient()

  // Score all 4 positions in parallel
  const positionResults = await Promise.all(
    ORACLE_POSITIONS.map(pos => scorePosition(userId, seasonId, pos)),
  )

  // Score text predictions (is_correct already set by admin)
  const { data: predRows } = await db
    .from('challenge_predictions')
    .select('id, is_correct')
    .eq('user_id', userId)
    .eq('season_id', seasonId)

  const predictionScore = (predRows ?? []).reduce(
    (sum: number, p: { id: string; is_correct: boolean | null }) =>
      sum + (p.is_correct === true ? 10 : 0),
    0,
  )

  const [qb, rb, wr, te] = positionResults.map(r => r.normalized)
  const overall = Math.round(((qb + rb + wr + te) / 4) * 10) / 10

  // Upsert accuracy_scores
  await db.from('accuracy_scores').upsert(
    {
      user_id: userId,
      season_id: seasonId,
      score_qb: qb,
      score_rb: rb,
      score_wr: wr,
      score_te: te,
      score_predictions: predictionScore,
      overall_score: overall,
      is_projected: false,
      computed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,season_id' },
  )

  // Upsert ranking_score_detail rows for each position
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
          raw_score: d.rawScore,
          confidence: d.confidence,
          final_score: d.finalScore,
        },
        { onConflict: 'user_id,season_id,position,player_id' },
      )
    }
  }
}
