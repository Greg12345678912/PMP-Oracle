import { getSession } from '@/lib/auth/server'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { getServiceClient } from '@/lib/league/db'
import { ORACLE_POSITIONS, POSITION_LIST_SIZE } from '@/lib/oracle/constants'
import type { RankingRow } from '@/lib/oracle/rankings'

// POST /api/oracle/rankings/enter
// Validates all 4 positions have required picks, then atomically marks the
// entry as submitted and assigns a monotonic entry_number via an RPC.
export async function POST() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const season = await getCurrentSeason()
  if (!season) return Response.json({ error: 'No active season' }, { status: 404 })
  if (isLocked(season)) return Response.json({ error: 'Locked' }, { status: 423 })

  const supabase = getServiceClient()
  const userId = session.user.id
  const seasonId = season.id

  // Server-side completeness check — prevents partial entries from being submitted
  // if the client somehow bypasses the UI guard.
  const { data: rankingRows } = await supabase
    .from('challenge_rankings')
    .select('position, rankings')
    .eq('user_id', userId)
    .eq('season_id', seasonId)

  const countByPos: Partial<Record<string, number>> = {}
  for (const row of rankingRows ?? []) {
    const rankings = row.rankings as RankingRow[] | null
    countByPos[row.position as string] = Array.isArray(rankings) ? rankings.length : 0
  }

  const incompletePositions = ORACLE_POSITIONS.filter(
    pos => (countByPos[pos] ?? 0) < POSITION_LIST_SIZE[pos],
  )
  if (incompletePositions.length > 0) {
    return Response.json(
      { error: `Incomplete rankings for: ${incompletePositions.join(', ')}` },
      { status: 422 },
    )
  }

  // Atomic submission — both writes happen inside a single DB transaction.
  const { data: entryNumber, error: rpcError } = await supabase.rpc('submit_oracle_entry', {
    p_user_id: userId,
    p_season_id: seasonId,
  })

  if (rpcError) {
    console.error('[oracle/enter] RPC error:', rpcError.message)
    return Response.json({ error: 'Submission failed' }, { status: 500 })
  }

  return Response.json({ ok: true, entryNumber: entryNumber ?? 0 })
}
