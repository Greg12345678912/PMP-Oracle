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
  const { count } = await supabase
    .from('challenge_rankings')
    .select('user_id', { count: 'exact', head: true })
    .eq('season_id', season.id)
    .eq('is_submitted', true)

  return Response.json({ ok: true, entryNumber: count ?? 1 })
}
