import { getSession } from '@/lib/auth/server'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { getRankings } from '@/lib/oracle/rankings'
import { getServiceClient } from '@/lib/league/db'
import { ORACLE_POSITIONS, POSITION_LIST_SIZE } from '@/lib/oracle/constants'
import type { OraclePosition } from '@/lib/oracle/constants'
import type { RankingRow } from '@/lib/oracle/rankings'
import { ReviewClient } from './client'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function ReviewPage() {
  const [session, season] = await Promise.all([getSession(), getCurrentSeason()])

  if (!session) redirect('/challenge/rankings')

  const locked = season ? isLocked(season) : true

  const rankingsArr = season
    ? await Promise.all(ORACLE_POSITIONS.map(pos => getRankings(session.user.id, season.id, pos)))
    : ORACLE_POSITIONS.map(() => [] as RankingRow[])

  const rankings = Object.fromEntries(
    ORACLE_POSITIONS.map((pos, i) => [pos, rankingsArr[i]])
  ) as Record<OraclePosition, RankingRow[]>

  // Check if already submitted — separate query since getRankings doesn't return is_submitted
  let isSubmitted = false
  if (season) {
    const db = getServiceClient()
    const { data } = await db
      .from('challenge_rankings')
      .select('is_submitted')
      .eq('user_id', session.user.id)
      .eq('season_id', season.id)
      .limit(1)
      .maybeSingle()
    isSubmitted = data?.is_submitted === true
  }

  return (
    <ReviewClient
      rankings={rankings}
      locked={locked}
      isSubmitted={isSubmitted}
    />
  )
}
