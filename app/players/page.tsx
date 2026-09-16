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
      db.from('ground_truth').select('player_id, rank').eq('season_id', rawSeason.id),
    ])
    currentWeek = (weekResult.data as Array<{ current_week: number }> | null)?.[0]?.current_week ?? 0

    // Re-sort each position pool by actual PPR season rank (rank 1 = best scorer)
    const gtRows = gtResult.data as Array<{ player_id: string; rank: number }> | null
    if (gtRows && gtRows.length > 0) {
      const gtRankMap = new Map(gtRows.map(r => [r.player_id, r.rank]))
      for (const pos of ORACLE_POSITIONS) {
        playersByPosition[pos] = [...playersByPosition[pos]].sort((a, b) => {
          const rankA = gtRankMap.get(a.id) ?? Infinity
          const rankB = gtRankMap.get(b.id) ?? Infinity
          return rankA - rankB
        })
      }
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="px-4 pt-5 pb-2">
        <h1 className="text-pmp-white font-bold text-xl">Players</h1>
        <p className="text-pmp-gray-600 text-xs mt-0.5">2026 Oracle · PPR</p>
      </div>
      <PlayersClient playersByPosition={playersByPosition} isPostLock={isPostLock} hasWeeklyScores={hasWeeklyScores} isScored={isScored} currentWeek={currentWeek} />
    </div>
  )
}
