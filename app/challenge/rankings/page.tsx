import { getSession } from '@/lib/auth/server'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { getRankings } from '@/lib/oracle/rankings'
import { getPlayerPool } from '@/lib/oracle/players'
import { RankingsClient } from './client'
import { ORACLE_POSITIONS } from '@/lib/oracle/constants'
import type { OraclePosition } from '@/lib/oracle/constants'
import type { RankingRow } from '@/lib/oracle/rankings'
import type { Player } from '@/lib/data/types'
import { getPreviewState } from '@/lib/oracle/dev-preview'

export const dynamic = 'force-dynamic'

export default async function RankingsPage() {
  const previewState = await getPreviewState()
  const [session, season] = await Promise.all([
    getSession(),
    getCurrentSeason(),
  ])

  // Locked when preview is active, no season exists, OR past lock date
  const locked = previewState !== null || (season ? isLocked(season) : true)

  // Fetch all 4 position pools in parallel
  const poolsArr = await Promise.all(
    ORACLE_POSITIONS.map(pos => getPlayerPool(pos)),
  )
  const players = Object.fromEntries(
    ORACLE_POSITIONS.map((pos, i) => [pos, poolsArr[i]]),
  ) as Record<OraclePosition, Player[]>

  // Fetch saved rankings for signed-in users (use real season ID so preview shows real submissions)
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
      lockAt={season?.lock_at ?? ''}
    />
  )
}
