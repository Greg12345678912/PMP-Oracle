/**
 * Temporary math audit endpoint. DELETE after use.
 * Re-runs scoring formula independently for ALL 116 users and compares to stored scores.
 * GET /api/verify/math?secret=PMPORACLE2026CRON
 */
import { getServiceClient } from '@/lib/league/db'

const SEASON_ID = 'e9929112-9137-4393-b983-3b52624712a2'
const POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (url.searchParams.get('secret') !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceClient()

  // 1. Fetch ground truth (current — cumulative through week 8)
  const { data: gtRows } = await db
    .from('ground_truth')
    .select('position, player_id, rank, ppr_points, player_name')
    .eq('season_id', SEASON_ID)

  // Build ground truth map: position → Map<playerId, rank>
  const gt: Record<string, Map<string, number>> = { QB: new Map(), RB: new Map(), WR: new Map(), TE: new Map() }
  for (const row of gtRows ?? []) {
    gt[row.position as string]?.set(row.player_id as string, row.rank as number)
  }

  // 2. Fetch all submitted picks
  const { data: rankingRows } = await db
    .from('challenge_rankings')
    .select('user_id, position, rankings')
    .eq('season_id', SEASON_ID)
    .eq('is_submitted', true)

  // Group picks by user_id → position → rankings[]
  type Pick = { playerId: string; playerRank: number; playerName: string }
  const userPicks = new Map<string, Record<string, Pick[]>>()
  for (const row of rankingRows ?? []) {
    const uid = row.user_id as string
    const pos = row.position as string
    const picks = row.rankings as Pick[] | null
    if (!userPicks.has(uid)) userPicks.set(uid, {})
    userPicks.get(uid)![pos] = Array.isArray(picks) ? picks : []
  }

  // 3. Fetch stored accuracy_scores
  const { data: storedScores } = await db
    .from('accuracy_scores')
    .select('user_id, overall_score, score_qb, score_rb, score_wr, score_te, top10_hits')
    .eq('season_id', SEASON_ID)

  const storedMap = new Map(
    (storedScores ?? []).map(s => [s.user_id as string, s])
  )

  // 4. Re-run scoring formula for every user
  const mismatches: object[] = []
  const verified: number[] = []
  let totalChecked = 0

  for (const [userId, picks] of userPicks.entries()) {
    const stored = storedMap.get(userId)
    if (!stored) continue

    let totalScore = 0
    let totalHits = 0
    const posScores: Record<string, number> = {}

    for (const pos of POSITIONS) {
      const userPosRanks = picks[pos] ?? []
      const truthMap = gt[pos]
      let posScore = 0
      let posHits = 0

      for (const pick of userPosRanks) {
        const actualRank = truthMap.get(pick.playerId) ?? null
        if (actualRank !== null) {
          const dist = Math.abs(pick.playerRank - actualRank)
          posScore += Math.max(0, 10 - dist)
          posHits++
        }
      }
      posScores[pos] = posScore
      totalScore += posScore
      totalHits += posHits
    }

    const computedOverall = totalScore / 4

    const storedOverall = stored.overall_score as number
    const storedQB = stored.score_qb as number
    const storedRB = stored.score_rb as number
    const storedWR = stored.score_wr as number
    const storedTE = stored.score_te as number
    const storedHits = stored.top10_hits as number

    const overallMatch = Math.abs(computedOverall - storedOverall) < 0.01
    const qbMatch = posScores.QB === storedQB
    const rbMatch = posScores.RB === storedRB
    const wrMatch = posScores.WR === storedWR
    const teMatch = posScores.TE === storedTE
    const hitsMatch = totalHits === storedHits

    totalChecked++

    if (!overallMatch || !qbMatch || !rbMatch || !wrMatch || !teMatch) {
      mismatches.push({
        userId,
        computed: { overall: computedOverall, QB: posScores.QB, RB: posScores.RB, WR: posScores.WR, TE: posScores.TE, hits: totalHits },
        stored: { overall: storedOverall, QB: storedQB, RB: storedRB, WR: storedWR, TE: storedTE, hits: storedHits },
      })
    } else {
      verified.push(computedOverall)
    }
  }

  // 5. Also verify one user in detail (the #1 ranked user)
  const { data: top1 } = await db
    .from('accuracy_scores')
    .select('user_id, overall_score, score_qb, score_rb, score_wr, score_te, global_rank')
    .eq('season_id', SEASON_ID)
    .eq('global_rank', 1)
    .single()

  const top1UserId = (top1 as { user_id: string } | null)?.user_id
  let top1Detail: object | null = null
  if (top1UserId) {
    const userPicksForTop1 = userPicks.get(top1UserId) ?? {}
    top1Detail = {
      storedScore: top1,
      picks: Object.fromEntries(
        POSITIONS.map(pos => [pos, (userPicksForTop1[pos] ?? []).map((p: Pick) => {
          const actualRank = gt[pos].get(p.playerId) ?? null
          const dist = actualRank !== null ? Math.abs(p.playerRank - actualRank) : null
          const pts = dist !== null ? Math.max(0, 10 - dist) : 0
          return { name: p.playerName, yourRank: p.playerRank, actualRank, dist, pts }
        })])
      ),
    }
  }

  return Response.json({
    summary: {
      totalChecked,
      perfectMatches: verified.length,
      mismatches: mismatches.length,
      allCorrect: mismatches.length === 0,
    },
    mismatches,
    top1DetailVerification: top1Detail,
    groundTruthSnapshot: Object.fromEntries(
      POSITIONS.map(pos => [pos, [...(gt[pos]?.entries() ?? [])].sort((a, b) => a[1] - b[1]).map(([id, rank]) => ({ id, rank }))])
    ),
  })
}
