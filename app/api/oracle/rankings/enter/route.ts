import { getSession } from '@/lib/auth/server'
import { getCurrentSeason } from '@/lib/oracle/season'
import { getServiceClient } from '@/lib/league/db'
import { ORACLE_LOCK_DATE } from '@/lib/oracle/constants'

// POST /api/oracle/rankings/enter
// Sets is_submitted = true for all challenge_rankings rows for user + current season.
// Inserts into oracle_entries (DO NOTHING on conflict — entry_number never changes).
// Returns entry_number from oracle_entries for social proof display.
export async function POST() {
  const session = await getSession()
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (new Date() >= ORACLE_LOCK_DATE) return Response.json({ error: 'Locked' }, { status: 423 })

  const season = await getCurrentSeason()
  if (!season) return Response.json({ error: 'No active season' }, { status: 404 })

  const supabase = getServiceClient()
  const userId = session.user.id
  const seasonId = season.id

  // Mark all position rankings as submitted
  await supabase
    .from('challenge_rankings')
    .update({ is_submitted: true, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('season_id', seasonId)

  // Insert into oracle_entries — DO NOTHING if already exists.
  // entry_number is a monotonic identity column; it never changes after first insert.
  await supabase
    .from('oracle_entries')
    .upsert(
      {
        user_id: userId,
        season_id: seasonId,
        entered_at: new Date().toISOString(),
        submission_metadata: {},
      },
      { onConflict: 'user_id,season_id', ignoreDuplicates: true },
    )

  // Read back the immutable entry_number
  const { data: entryRow } = await supabase
    .from('oracle_entries')
    .select('entry_number')
    .eq('user_id', userId)
    .eq('season_id', seasonId)
    .single()

  const entryNumber = (entryRow as { entry_number: number } | null)?.entry_number ?? 0

  return Response.json({ ok: true, entryNumber })
}
