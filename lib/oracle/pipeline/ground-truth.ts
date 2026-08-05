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
      .sort((a, b) => {
        const diff = b[1].total - a[1].total
        if (diff !== 0) return diff
        // Stable tiebreaker: player_id alphabetically (deterministic across environments)
        return a[0] < b[0] ? -1 : 1
      })
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

      // Delete old ground truth for this position + season before inserting
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
