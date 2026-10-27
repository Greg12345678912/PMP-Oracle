/**
 * Temporary week 7 verification endpoint. DELETE after use.
 * GET /api/verify/week7?secret=PMPORACLE2026CRON
 */
import { getServiceClient } from '@/lib/league/db'

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (url.searchParams.get('secret') !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceClient()
  const SEASON_ID = 'e9929112-9137-4393-b983-3b52624712a2'
  const WEEK = 7

  // 1. Sync jobs — last pipeline run
  const { data: jobs } = await db
    .from('sync_jobs')
    .select('status, started_at, completed_at, records_processed, error, metadata')
    .eq('resource', 'oracle_pipeline')
    .order('started_at', { ascending: false })
    .limit(3)

  // 2. Season status
  const { data: season } = await db
    .from('seasons')
    .select('id, year, status, lock_at, scored_at')
    .eq('id', SEASON_ID)
    .single()

  // 3. Week 7 stats — count + key Eagles/Cowboys players
  const { count: statsCount } = await db
    .from('player_stats')
    .select('*', { count: 'exact', head: true })
    .eq('season_id', SEASON_ID)
    .eq('week', WEEK)

  const KEY_IDS = ['4866','7525','5022','13294','6786','8137','7588','3294','8110']
  const { data: keyStats } = await db
    .from('player_stats')
    .select('player_id, player_name, position, ppr_points, week')
    .eq('season_id', SEASON_ID)
    .eq('week', WEEK)
    .in('player_id', KEY_IDS)
    .order('ppr_points', { ascending: false })

  // 4. Ground truth — all 4 positions
  const { data: groundTruth } = await db
    .from('ground_truth')
    .select('position, rank, player_name, ppr_points')
    .eq('season_id', SEASON_ID)
    .order('position')
    .order('rank')

  // 5. Leaderboard — top 20 by overall_score
  const { data: leaderboard, count: totalUsers } = await db
    .from('accuracy_scores')
    .select('user_id, overall_score, score_qb, score_rb, score_wr, score_te, global_rank, current_week, top10_hits', { count: 'exact' })
    .eq('season_id', SEASON_ID)
    .order('overall_score', { ascending: false })
    .limit(20)

  // 6. Score distribution sanity
  const { data: scoreStats } = await db
    .from('accuracy_scores')
    .select('overall_score')
    .eq('season_id', SEASON_ID)
    .order('overall_score', { ascending: false })

  const scores = (scoreStats ?? []).map((r: { overall_score: number }) => r.overall_score)
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  const min = scores.length ? Math.min(...scores) : 0
  const max = scores.length ? Math.max(...scores) : 0

  // 7. Current week from league_state
  const { data: leagueState } = await db
    .from('league_state')
    .select('current_week, nfl_week, last_synced_at')
    .eq('season_id', SEASON_ID)
    .single()

  // 8. Check emails table if it exists
  const { data: emailLog, error: emailErr } = await db
    .from('email_log')
    .select('week, sent_at, recipient_count, type')
    .order('sent_at', { ascending: false })
    .limit(5)

  return Response.json({
    season,
    leagueState,
    syncJobs: jobs,
    stats: {
      week7Count: statsCount,
      keyPlayers: keyStats,
    },
    groundTruth,
    leaderboard: {
      totalUsers,
      top20: leaderboard,
      scoreDistribution: { avg: avg.toFixed(2), min: min.toFixed(2), max: max.toFixed(2), count: scores.length },
    },
    emails: emailErr ? { note: 'No email_log table or no rows', error: emailErr.message } : emailLog,
  })
}
