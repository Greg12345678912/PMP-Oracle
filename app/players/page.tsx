import { getPlayerPool } from '@/lib/oracle/players'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { ORACLE_POSITIONS } from '@/lib/oracle/constants'
import type { OraclePosition } from '@/lib/oracle/constants'
import type { Player } from '@/lib/data/types'
import { PlayersClient } from './client'
import { getPreviewState, mockSeason } from '@/lib/oracle/dev-preview'

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
  const hasWeeklyScores = season
    ? season.status === 'scoring' || season.status === 'scored'
    : false

  return (
    <div className="max-w-md mx-auto">
      <div className="px-4 pt-5 pb-2">
        <h1 className="text-pmp-white font-bold text-xl">Players</h1>
        <p className="text-pmp-gray-600 text-xs mt-0.5">2026 Oracle · PPR</p>
      </div>
      <PlayersClient playersByPosition={playersByPosition} isPostLock={isPostLock} hasWeeklyScores={hasWeeklyScores} />
    </div>
  )
}
