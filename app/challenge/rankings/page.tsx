import { getSession } from '@/lib/auth/server'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { getRankings } from '@/lib/oracle/rankings'

export const metadata = { title: 'Rankings' }
import { getPlayerPool } from '@/lib/oracle/players'
import { RankingsClient } from './client'
import { ORACLE_POSITIONS } from '@/lib/oracle/constants'
import type { OraclePosition } from '@/lib/oracle/constants'
import type { RankingRow } from '@/lib/oracle/rankings'
import type { Player } from '@/lib/data/types'
import { getServiceClient } from '@/lib/league/db'
import { getPreviewState, PREVIEW_USERNAME } from '@/lib/oracle/dev-preview'

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

  // Fetch saved rankings — prefer real session, fall back to preview username lookup
  let initialRankings: Partial<Record<OraclePosition, RankingRow[]>> = {}
  const userId = session?.user.id ?? (previewState ? await (async () => {
    const db = getServiceClient()
    const { data } = await db
      .from('user_profiles')
      .select('user_id')
      .eq('username', PREVIEW_USERNAME)
      .maybeSingle()
    return (data as { user_id: string } | null)?.user_id ?? null
  })() : null)

  if (userId && season) {
    const savedArr = await Promise.all(
      ORACLE_POSITIONS.map(pos => getRankings(userId, season.id, pos)),
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
