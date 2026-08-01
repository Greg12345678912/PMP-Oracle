import { getServiceClient } from '@/lib/league/db'
import type { OraclePosition } from './constants'
import { POSITION_LIST_SIZE } from './constants'

export interface RankingRow {
  playerRank: number
  playerId: string
  playerName: string
  confidence: 'low' | 'medium' | 'high'
}

export type ValidateResult = { ok: true } | { ok: false; error: string }

export function validateRankings(position: OraclePosition, rows: RankingRow[]): ValidateResult {
  const max = POSITION_LIST_SIZE[position]
  if (rows.length > max) return { ok: false, error: `Max ${max} players for ${position}` }
  const ranks = rows.map(r => r.playerRank)
  if (new Set(ranks).size !== ranks.length) return { ok: false, error: 'Duplicate ranks' }
  return { ok: true }
}

/** Type guard: validates that an unknown value is a RankingRow array */
function isRankingRowArray(value: unknown): value is RankingRow[] {
  if (!Array.isArray(value)) return false
  return value.every(
    (item): item is RankingRow =>
      item !== null &&
      typeof item === 'object' &&
      typeof (item as Record<string, unknown>).playerRank === 'number' &&
      typeof (item as Record<string, unknown>).playerId === 'string' &&
      typeof (item as Record<string, unknown>).playerName === 'string' &&
      ['low', 'medium', 'high'].includes((item as Record<string, unknown>).confidence as string),
  )
}

/** Composite key helper — describes how a rankings record is uniquely identified */
export function rankingsKey(userId: string, seasonId: string, position: OraclePosition) {
  return { user_id: userId, season_id: seasonId, position }
}

export async function getRankings(
  userId: string,
  seasonId: string,
  position: OraclePosition,
): Promise<RankingRow[]> {
  const db = getServiceClient()
  const { data } = await db
    .from('challenge_rankings')
    .select('rankings')
    .eq('user_id', userId)
    .eq('season_id', seasonId)
    .eq('position', position)
    .maybeSingle()
  if (!data) return []
  const parsed: unknown = typeof data.rankings === 'string'
    ? JSON.parse(data.rankings)
    : data.rankings
  return isRankingRowArray(parsed) ? parsed : []
}

export async function upsertRankings(
  userId: string,
  seasonId: string,
  position: OraclePosition,
  rows: RankingRow[],
): Promise<void> {
  const db = getServiceClient()
  await db
    .from('challenge_rankings')
    .upsert(
      {
        user_id: userId,
        season_id: seasonId,
        position,
        rankings: rows,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,season_id,position' },
    )
}
