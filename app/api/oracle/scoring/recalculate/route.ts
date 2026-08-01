import { getServiceClient } from '@/lib/league/db'
import { getCurrentSeason } from '@/lib/oracle/season'
import { scoreUser } from '@/lib/oracle/scoring'

// POST /api/oracle/scoring/recalculate
// Called weekly by Vercel Cron every Tuesday after Monday Night Football.
// Scores every submitted participant and updates global ranks + rank movement.
export async function POST(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const weekParam = new URL(request.url).searchParams.get('week')
  const currentWeek = weekParam ? parseInt(weekParam, 10) : 0

  const season = await getCurrentSeason()
  if (!season) return Response.json({ error: 'No active season' }, { status: 404 })

  const db = getServiceClient()

  // Collect all submitted user IDs (deduplicated)
  const { data: submittedRows, error: fetchErr } = await db
    .from('challenge_rankings')
    .select('user_id')
    .eq('season_id', season.id)
    .eq('is_submitted', true)

  if (fetchErr) return Response.json({ error: fetchErr.message }, { status: 500 })

  const userIds = [...new Set((submittedRows ?? []).map(r => r.user_id as string))]

  // Save current ranks before recalculating (for movement tracking)
  const { data: prevScores } = await db
    .from('accuracy_scores')
    .select('user_id, global_rank')
    .eq('season_id', season.id)

  const prevRankMap = new Map(
    (prevScores ?? []).map(s => [s.user_id as string, (s.global_rank as number | null) ?? null])
  )

  // Score every participant
  let scored = 0
  let failed = 0
  for (const userId of userIds) {
    try {
      await scoreUser(userId, season.id)
      scored++
    } catch {
      failed++
    }
  }

  // Fetch all updated scores and re-rank by overall_score descending
  const { data: allScores } = await db
    .from('accuracy_scores')
    .select('user_id, overall_score')
    .eq('season_id', season.id)
    .order('overall_score', { ascending: false })

  // Assign global ranks + compute movement
  const updates = (allScores ?? []).map((row, i) => {
    const userId = row.user_id as string
    const newRank = i + 1
    const prev = prevRankMap.get(userId) ?? null
    const rankChange = prev != null ? prev - newRank : null // positive = moved up

    return {
      user_id: userId,
      season_id: season.id,
      global_rank: newRank,
      prev_rank: prev,
      rank_change: rankChange,
      current_week: currentWeek,
    }
  })

  for (const update of updates) {
    await db
      .from('accuracy_scores')
      .update({
        global_rank: update.global_rank,
        prev_rank: update.prev_rank,
        rank_change: update.rank_change,
        current_week: update.current_week,
      })
      .eq('user_id', update.user_id)
      .eq('season_id', update.season_id)
  }

  return Response.json({
    ok: true,
    season: season.year,
    week: currentWeek,
    scored,
    failed,
    ranked: updates.length,
  })
}
