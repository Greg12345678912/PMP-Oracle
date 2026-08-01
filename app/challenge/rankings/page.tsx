import { getSession } from '@/lib/auth/server'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { getRankings } from '@/lib/oracle/rankings'
import { getPlayerPool } from '@/lib/oracle/players'
import { RankingsClient } from './client'
import { ORACLE_POSITIONS } from '@/lib/oracle/constants'
import type { OraclePosition } from '@/lib/oracle/constants'
import type { RankingRow } from '@/lib/oracle/rankings'
import type { Player } from '@/lib/data/types'

export const dynamic = 'force-dynamic'

export default async function RankingsPage() {
  const [session, season] = await Promise.all([
    getSession(),
    getCurrentSeason(),
  ])

  // Locked when no season exists OR season status !== 'open' OR past lock date
  const locked = season ? isLocked(season) : true

  // Fetch all 4 position pools in parallel
  const poolsArr = await Promise.all(
    ORACLE_POSITIONS.map(pos => getPlayerPool(pos)),
  )
  const players = Object.fromEntries(
    ORACLE_POSITIONS.map((pos, i) => [pos, poolsArr[i]]),
  ) as Record<OraclePosition, Player[]>

  // Fetch saved rankings for signed-in users
  let initialRankings: Partial<Record<OraclePosition, RankingRow[]>> = {}
  if (session && season) {
    const savedArr = await Promise.all(
      ORACLE_POSITIONS.map(pos =>
        getRankings(session.user.id, season.id, pos),
      ),
    )
    initialRankings = Object.fromEntries(
      ORACLE_POSITIONS.map((pos, i) => [pos, savedArr[i]]),
    ) as Record<OraclePosition, RankingRow[]>
  }

  return (
    <RankingsClient
      initialRankings={initialRankings}
      players={players}
      locked={locked}
      isSignedIn={!!session}
    />
  )
}
