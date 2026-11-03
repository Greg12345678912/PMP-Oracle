/**
 * Temporary week 8 verification endpoint. DELETE after use.
 * GET /api/verify/week8?secret=PMPORACLE2026CRON
 */
import { getServiceClient } from '@/lib/league/db'

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (url.searchParams.get('secret') !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceClient()
  const SEASON_ID = 'e9929112-9137-4393-b983-3b52624712a2'
  const WEEK = 8

  // 1. Last 4 sync jobs
  const { data: jobs } = await db
    .from('sync_jobs')
    .select('status, started_at, completed_at, records_processed, error, metadata')
    .eq('resource', 'oracle_pipeline')
    .order('started_at', { ascending: false })
    .limit(4)

  // 2. Season + league state
  const { data: season } = await db
    .from('seasons')
    .select('id, year, status')
    .eq('id', SEASON_ID)
    .single()

  const { data: leagueState } = await db
    .from('league_state')
    .select('current_week, nfl_week, last_synced_at')
    .eq('season_id', SEASON_ID)
    .single()

  // 3. What week is accuracy_scores currently on?
  const { data: weekRows } = await db
    .from('accuracy_scores')
    .select('current_week')
    .eq('season_id', SEASON_ID)
    .gt('current_week', 0)
    .order('current_week', { ascending: false })
    .limit(1)
  const lastScoredWeek = (weekRows as Array<{ current_week: number }> | null)?.[0]?.current_week ?? 0

  // 4. Week 8 stats — count + Bears/Seahawks key players
  const { count: statsCount } = await db
    .from('player_stats')
    .select('*', { count: 'exact', head: true })
    .eq('season_id', SEASON_ID)
    .eq('week', WEEK)

  const KEY_IDS = ['11560','6790','12517','12519','11620','4943','9488','9753','13286','4039','11603']
  const { data: keyStats } = await db
    .from('player_stats')
    .select('player_id, player_name, position, ppr_points, week')
    .eq('season_id', SEASON_ID)
    .eq('week', WEEK)
    .in('player_id', KEY_IDS)
    .order('ppr_points', { ascending: false })

  // 5. Ground truth
  const { data: groundTruth } = await db
    .from('ground_truth')
    .select('position, rank, player_name, ppr_points')
    .eq('season_id', SEASON_ID)
    .order('position')
    .order('rank')

  // 6. Leaderboard top 20
  const { data: leaderboard, count: totalUsers } = await db
    .from('accuracy_scores')
    .select('user_id, overall_score, score_qb, score_rb, score_wr, score_te, global_rank, current_week, top10_hits', { count: 'exact' })
    .eq('season_id', SEASON_ID)
    .order('overall_score', { ascending: false })
    .limit(20)

  // 7. Score distribution
  const { data: allScores } = await db
    .from('accuracy_scores')
    .select('overall_score')
    .eq('season_id', SEASON_ID)
    .order('overall_score', { ascending: false })

  const scores = (allScores ?? []).map((r: { overall_score: number }) => r.overall_score)
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0

  return Response.json({
    lastScoredWeek,
    season,
    leagueState,
    syncJobs: jobs,
    week8Stats: {
      count: statsCount,
      keyPlayers: keyStats,
    },
    groundTruth,
    leaderboard: {
      totalUsers,
      top20: leaderboard,
      scoreDistribution: {
        avg: avg.toFixed(2),
        min: scores.length ? Math.min(...scores).toFixed(2) : 0,
        max: scores.length ? Math.max(...scores).toFixed(2) : 0,
        count: scores.length,
      },
    },
  })
}
