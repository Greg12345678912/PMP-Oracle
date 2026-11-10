/**
 * Temporary week 9 verification + math audit. DELETE after use.
 * GET /api/verify/week9?secret=PMPORACLE2026CRON
 */
import { getServiceClient } from '@/lib/league/db'

const SEASON_ID = 'e9929112-9137-4393-b983-3b52624712a2'
const WEEK = 9
const POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (url.searchParams.get('secret') !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceClient()

  // 1. Sync jobs
  const { data: jobs } = await db
    .from('sync_jobs')
    .select('status, started_at, completed_at, records_processed, error, metadata')
    .eq('resource', 'oracle_pipeline')
    .order('started_at', { ascending: false })
    .limit(3)

  // 2. Season + league state
  const { data: season } = await db
    .from('seasons').select('id, year, status').eq('id', SEASON_ID).single()

  const { data: leagueState } = await db
    .from('league_state').select('current_week, nfl_week, last_synced_at').eq('season_id', SEASON_ID).single()

  // 3. Last scored week
  const { data: weekRows } = await db
    .from('accuracy_scores').select('current_week').eq('season_id', SEASON_ID)
    .gt('current_week', 0).order('current_week', { ascending: false }).limit(1)
  const lastScoredWeek = (weekRows as Array<{ current_week: number }> | null)?.[0]?.current_week ?? 0

  // 4. Week 9 stats — count + Bills/Vikings key players
  const { count: statsCount } = await db
    .from('player_stats').select('*', { count: 'exact', head: true })
    .eq('season_id', SEASON_ID).eq('week', WEEK)

  const KEY_IDS = ['4984','8138','10236','4983','8134','11637','5849','4199','8408','5844','6794','9756']
  const { data: keyStats } = await db
    .from('player_stats').select('player_id, player_name, position, ppr_points')
    .eq('season_id', SEASON_ID).eq('week', WEEK).in('player_id', KEY_IDS)
    .order('ppr_points', { ascending: false })

  // 5. Ground truth
  const { data: groundTruth } = await db
    .from('ground_truth').select('position, rank, player_name, ppr_points')
    .eq('season_id', SEASON_ID).order('position').order('rank')

  // 6. Leaderboard top 20
  const { data: leaderboard, count: totalUsers } = await db
    .from('accuracy_scores')
    .select('user_id, overall_score, score_qb, score_rb, score_wr, score_te, global_rank, rank_change, current_week, top10_hits', { count: 'exact' })
    .eq('season_id', SEASON_ID).order('global_rank', { ascending: true }).limit(20)

  // 7. Score distribution
  const { data: allScores } = await db
    .from('accuracy_scores').select('overall_score').eq('season_id', SEASON_ID)
  const scores = (allScores ?? []).map((r: { overall_score: number }) => r.overall_score)
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0

  // 8. MATH AUDIT — re-run formula for all 116 users
  const { data: gtRows } = await db
    .from('ground_truth').select('position, player_id, rank').eq('season_id', SEASON_ID)
  const gt: Record<string, Map<string, number>> = { QB: new Map(), RB: new Map(), WR: new Map(), TE: new Map() }
  for (const row of gtRows ?? []) gt[row.position as string]?.set(row.player_id as string, row.rank as number)

  const { data: rankingRows } = await db
    .from('challenge_rankings').select('user_id, position, rankings')
    .eq('season_id', SEASON_ID).eq('is_submitted', true)

  type Pick = { playerId: string; playerRank: number; playerName: string }
  const userPicks = new Map<string, Record<string, Pick[]>>()
  for (const row of rankingRows ?? []) {
    const uid = row.user_id as string
    const pos = row.position as string
    const picks = row.rankings as Pick[] | null
    if (!userPicks.has(uid)) userPicks.set(uid, {})
    userPicks.get(uid)![pos] = Array.isArray(picks) ? picks : []
  }

  const { data: storedScores } = await db
    .from('accuracy_scores').select('user_id, overall_score, score_qb, score_rb, score_wr, score_te, top10_hits')
    .eq('season_id', SEASON_ID)
  const storedMap = new Map((storedScores ?? []).map(s => [s.user_id as string, s]))

  let mathPerfect = 0
  const mathMismatches: object[] = []

  for (const [userId, picks] of userPicks.entries()) {
    const stored = storedMap.get(userId)
    if (!stored) continue
    let total = 0
    const posScores: Record<string, number> = {}
    for (const pos of POSITIONS) {
      let posScore = 0
      for (const pick of picks[pos] ?? []) {
        const actualRank = gt[pos].get(pick.playerId) ?? null
        if (actualRank !== null) posScore += Math.max(0, 10 - Math.abs(pick.playerRank - actualRank))
      }
      posScores[pos] = posScore
      total += posScore
    }
    const computed = total / 4
    const ok = Math.abs(computed - (stored.overall_score as number)) < 0.01 &&
      posScores.QB === stored.score_qb && posScores.RB === stored.score_rb &&
      posScores.WR === stored.score_wr && posScores.TE === stored.score_te
    if (ok) mathPerfect++
    else mathMismatches.push({ userId, computed: { overall: computed, ...posScores }, stored })
  }

  return Response.json({
    pipeline: { lastScoredWeek, season, leagueState, syncJobs: jobs },
    stats: { week9Count: statsCount, keyPlayers: keyStats },
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
    mathAudit: {
      totalChecked: mathPerfect + mathMismatches.length,
      perfectMatches: mathPerfect,
      mismatches: mathMismatches.length,
      allCorrect: mathMismatches.length === 0,
      details: mathMismatches,
    },
  })
}
