import { getSession } from '@/lib/auth/server'
import { getCurrentSeason } from '@/lib/oracle/season'
import { getServiceClient } from '@/lib/league/db'
import { ORACLE_LOCK_DATE } from '@/lib/oracle/constants'

// POST /api/oracle/rankings/enter
// Sets is_submitted = true for all challenge_rankings rows for user + current season
// Returns entryNumber — total submitted entries after this user's (for social proof display)
export async function POST() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (new Date() >= ORACLE_LOCK_DATE) return Response.json({ error: 'Locked' }, { status: 423 })

  const season = await getCurrentSeason()
  if (!season) return Response.json({ error: 'No active season' }, { status: 404 })

  const supabase = getServiceClient()
  await supabase
    .from('challenge_rankings')
    .update({ is_submitted: true, updated_at: new Date().toISOString() })
    .eq('user_id', session.user.id)
    .eq('season_id', season.id)

  // Count distinct submitted users for social proof
  // challenge_rankings has one row per (user, season, position) so we can't use
  // head: true count — that would count rows, not users (up to 4x inflated).
  const { data: submittedRows } = await supabase
    .from('challenge_rankings')
    .select('user_id')
    .eq('season_id', season.id)
    .eq('is_submitted', true)

  const entryNumber = new Set((submittedRows ?? []).map(r => r.user_id as string)).size

  return Response.json({ ok: true, entryNumber })
}
