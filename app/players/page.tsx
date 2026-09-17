import { getPlayerPool } from '@/lib/oracle/players'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { ORACLE_POSITIONS } from '@/lib/oracle/constants'

export const metadata = { title: 'Players' }
import type { OraclePosition } from '@/lib/oracle/constants'
import type { Player } from '@/lib/data/types'
import { PlayersClient } from './client'
import { getPreviewState, mockSeason, mockAccuracyScore } from '@/lib/oracle/dev-preview'
import { getServiceClient } from '@/lib/league/db'

export const dynamic = 'force-dynamic'

export default async function PlayersPage() {
  const previewState = await getPreviewState()
  const [poolsArr, rawSeason] = await Promise.all([
    Promise.all(ORACLE_POSITIONS.map(pos => getPlayerPool(pos))),
    getCurrentSeason(),
  ])
  const playersByPosition = Object.fromEntries(
    ORACLE_POSITIONS.map((pos, i) => [pos, poolsArr[i]]),
  ) as Record<OraclePosition, Player[]>

  const season = previewState ? mockSeason(previewState) : rawSeason
  const isPostLock = season ? isLocked(season) : false
  const isScored = season?.status === 'scored'
  const hasWeeklyScores = season
    ? season.status === 'scoring' || season.status === 'scored'
    : false

  let currentWeek = 0
  if (previewState) {
    currentWeek = mockAccuracyScore(previewState)?.current_week ?? 0
  } else if (hasWeeklyScores && rawSeason) {
    const db = getServiceClient()
    const [weekResult, gtResult] = await Promise.all([
      db.from('accuracy_scores').select('current_week').eq('season_id', rawSeason.id).gt('current_week', 0).limit(1),
      db.from('ground_truth').select('player_id, rank, position, player_name').eq('season_id', rawSeason.id),
    ])
    currentWeek = (weekResult.data as Array<{ current_week: number }> | null)?.[0]?.current_week ?? 0

    // Build playersByPosition directly from ground_truth (ranked by actual PPR points).
    // Cross-reference the ADP pool for headshot/team metadata.
    // Players not in the pool (e.g. Engram, Fant missing from player_cache) get a
    // minimal stub — they still show with correct name, rank, and position.
    type GtRow = { player_id: string; rank: number; position: string; player_name: string }
    const gtRows = gtResult.data as GtRow[] | null
    if (gtRows && gtRows.length > 0) {
      const poolMap = new Map<string, Player>()
      for (const pos of ORACLE_POSITIONS) {
        for (const p of playersByPosition[pos] ?? []) poolMap.set(p.id, p)
      }

      // Fetch player_cache rows for any ground_truth player missing from the ADP pool
      // (e.g. Engram, Fant — in player_cache but adp_value IS NULL so excluded from pool).
      const missingIds = gtRows.map(r => r.player_id).filter(id => !poolMap.has(id))
      if (missingIds.length > 0) {
        type CacheRow = { external_id: string; full_name: string; first_name: string; last_name: string; team: string | null; headshot_url: string | null; bye_week: number | null }
        const { data: cacheRows } = await db
          .from('player_cache')
          .select('external_id, full_name, first_name, last_name, team, headshot_url, bye_week')
          .in('external_id', missingIds)
          .eq('provider', 'sleeper')
        for (const row of (cacheRows as CacheRow[] | null) ?? []) {
          // Find the ground_truth row to get position
          const gt = gtRows.find(r => r.player_id === row.external_id)
          if (!gt) continue
          poolMap.set(row.external_id, {
            id: row.external_id,
            name: row.full_name,
            firstName: row.first_name,
            lastName: row.last_name,
            team: row.team ?? '',
            position: gt.position as OraclePosition,
            headshotUrl: row.headshot_url ?? '',
            searchRank: 999,
            byeWeek: row.bye_week,
          })
        }
      }

      for (const pos of ORACLE_POSITIONS) {
        playersByPosition[pos] = gtRows
          .filter(r => r.position === pos)
          .sort((a, b) => a.rank - b.rank)
          .map(r => poolMap.get(r.player_id) ?? {
            id: r.player_id,
            name: r.player_name,
            firstName: r.player_name.split(' ')[0] ?? '',
            lastName: r.player_name.split(' ').slice(1).join(' ') || r.player_name,
            team: '',
            position: pos,
            headshotUrl: '',
            searchRank: 999,
            byeWeek: null,
          })
      }
    }
  }

  // searchPool = ADP pool + any ground_truth players absent from it (e.g. Engram, Fant).
  // ADP pool covers ~200 relevant players; gtExtras fills the null-adp_value gap.
  const adpPlayers = ORACLE_POSITIONS.flatMap(pos => poolsArr[ORACLE_POSITIONS.indexOf(pos)] ?? [])
  const adpIds = new Set(adpPlayers.map(p => p.id))
  const gtExtras = ORACLE_POSITIONS.flatMap(pos => (playersByPosition[pos] ?? []).filter(p => !adpIds.has(p.id)))
  const searchPool = [...adpPlayers, ...gtExtras]

  return (
    <div className="max-w-md mx-auto">
      <div className="px-4 pt-5 pb-2">
        <h1 className="text-pmp-white font-bold text-xl">Players</h1>
        <p className="text-pmp-gray-600 text-xs mt-0.5">2026 Oracle · PPR</p>
      </div>
      <PlayersClient playersByPosition={playersByPosition} searchPool={searchPool} isPostLock={isPostLock} hasWeeklyScores={hasWeeklyScores} isScored={isScored} currentWeek={currentWeek} />
    </div>
  )
}
