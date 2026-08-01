import { getPlayerPool } from '@/lib/oracle/players'
import { ORACLE_POSITIONS, ORACLE_LOCK_DATE } from '@/lib/oracle/constants'
import type { OraclePosition } from '@/lib/oracle/constants'
import type { Player } from '@/lib/data/types'
import { PlayersClient } from './client'

export const dynamic = 'force-dynamic'

export default async function PlayersPage() {
  const poolsArr = await Promise.all(ORACLE_POSITIONS.map(pos => getPlayerPool(pos)))
  const playersByPosition = Object.fromEntries(
    ORACLE_POSITIONS.map((pos, i) => [pos, poolsArr[i]]),
  ) as Record<OraclePosition, Player[]>

  const isPostLock = new Date() >= ORACLE_LOCK_DATE

  return (
    <div className="max-w-md mx-auto">
      <div className="px-4 pt-5 pb-2">
        <h1 className="text-pmp-white font-bold text-xl">Players</h1>
        <p className="text-pmp-gray-600 text-xs mt-0.5">2026 Oracle · PPR</p>
      </div>
      <PlayersClient playersByPosition={playersByPosition} isPostLock={isPostLock} />
    </div>
  )
}
