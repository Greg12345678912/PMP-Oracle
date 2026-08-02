import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/server'
import { getCurrentSeason } from '@/lib/oracle/season'
import { getServiceClient } from '@/lib/league/db'
import { ORACLE_POSITIONS } from '@/lib/oracle/constants'
import { generateSummary } from '@/lib/oracle/scoring'
import type { OracleResult, PositionResult, PlayerScore } from '@/lib/oracle/scoring'
import { ResultsShareCard } from '@/components/oracle/ResultsShareCard'

export const dynamic = 'force-dynamic'

// ─── Types for DB rows ──────────────────────────────────────────────────────

interface AccuracyScoreRow {
  overall_score: number
  score_qb: number
  score_rb: number
  score_wr: number
  score_te: number
  global_rank: number | null
  rank_change: number | null
  current_week: number
  computed_at: string | null
}

interface RankingScoreDetailRow {
  position: string
  player_id: string
  player_name: string
  user_rank: number
  actual_rank: number | null
  distance: number | null
  final_score: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function computePercentile(rank: number, total: number): number {
  if (total <= 1) return 1
  return Math.max(1, Math.round(((total - rank + 1) / total) * 100))
}

// ─── Holding page (pre-Week 1) ──────────────────────────────────────────────

function HoldingPage() {
  return (
    <div className="min-h-[100dvh] bg-pmp-black flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-xs flex flex-col gap-6 text-center">
        <div className="flex flex-col gap-2">
          <p className="text-pmp-red text-xs font-bold uppercase tracking-widest">2026 Oracle Challenge</p>
          <h1 className="text-pmp-white font-bold text-2xl">Your first score arrives after Week 1.</h1>
          <p className="text-pmp-gray-500 text-sm leading-relaxed">
            Once Week 1 games complete we&apos;ll score your rankings and show you:
          </p>
        </div>

        <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-5 py-5 flex flex-col gap-3 text-left">
          {[
            { icon: '📊', label: 'Overall accuracy' },
            { icon: '🏈', label: 'Position accuracy (QB, RB, WR, TE)' },
            { icon: '🏆', label: 'Your current rank' },
            { icon: '📈', label: 'Weekly movement ▲ ▼' },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-base w-6 text-center shrink-0">{icon}</span>
              <p className="text-pmp-white text-sm">{label}</p>
            </div>
          ))}
        </div>

        <p className="text-pmp-gray-600 text-xs">
          Scores update every Tuesday throughout the season.
        </p>

        <Link
          href="/challenge/rankings"
          className="text-pmp-red text-sm font-semibold hover:opacity-80"
        >
          View My Rankings →
        </Link>
      </div>
    </div>
  )
}

// ─── Weekly rank card (during season, before final scoring) ─────────────────

function WeeklyRankPage({
  scoreData,
  totalParticipants,
}: {
  scoreData: AccuracyScoreRow
  totalParticipants: number
}) {
  const rank = scoreData.global_rank ?? totalParticipants
  const percentile = computePercentile(rank, totalParticipants)
  const rankChange = scoreData.rank_change
  const up = rankChange != null && rankChange > 0
  const down = rankChange != null && rankChange < 0

  return (
    <div className="min-h-[100dvh] bg-pmp-black flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-xs flex flex-col gap-6">
        <div className="text-center flex flex-col gap-1">
          <p className="text-pmp-red text-xs font-bold uppercase tracking-widest">2026 Oracle Challenge</p>
          <p className="text-pmp-gray-500 text-sm">Week {scoreData.current_week} standings</p>
        </div>

        {/* Rank hero card */}
        <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-8 flex flex-col items-center gap-1 border-b border-dashed border-pmp-gray-800">
            <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">Current Rank</p>
            <p className="text-pmp-white font-black text-7xl leading-none mt-2">
              #{rank.toLocaleString()}
            </p>
            {rankChange != null && rankChange !== 0 && (
              <p className={['text-sm font-semibold mt-2', up ? 'text-green-400' : 'text-pmp-red'].join(' ')}>
                {up ? `▲ Up ${rankChange} spot${rankChange === 1 ? '' : 's'} this week` : `▼ Down ${Math.abs(rankChange)} spot${Math.abs(rankChange) === 1 ? '' : 's'} this week`}
              </p>
            )}
          </div>
          <div className="px-5 py-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-pmp-gray-500 text-sm">Overall accuracy</span>
              <span className="text-pmp-white text-sm font-bold">{scoreData.overall_score.toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-pmp-gray-500 text-sm">Percentile</span>
              <span className="text-pmp-white text-sm font-bold">Top {percentile}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-pmp-gray-500 text-sm">Participants</span>
              <span className="text-pmp-white text-sm font-bold">{totalParticipants.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Position breakdown */}
        <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-5 py-4 flex flex-col gap-3">
          <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">Position Accuracy</p>
          {(
            [
              { pos: 'QB', score: scoreData.score_qb },
              { pos: 'RB', score: scoreData.score_rb },
              { pos: 'WR', score: scoreData.score_wr },
              { pos: 'TE', score: scoreData.score_te },
            ] as const
          ).map(({ pos, score }) => (
            <div key={pos} className="flex items-center gap-3">
              <span className="text-pmp-gray-500 text-xs w-6 shrink-0">{pos}</span>
              <div className="flex-1 h-1.5 bg-pmp-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-pmp-red rounded-full" style={{ width: `${score ?? 0}%` }} />
              </div>
              <span className="text-pmp-white text-xs font-bold w-10 text-right">{(score ?? 0).toFixed(1)}</span>
            </div>
          ))}
        </div>

        <p className="text-pmp-gray-600 text-xs text-center">
          Scores update every Tuesday · Final results after Week 18
        </p>

        <Link
          href="/challenge/leaderboard"
          className="w-full bg-pmp-gray-900 border border-pmp-gray-700 text-pmp-white font-semibold py-3 rounded-xl text-sm text-center hover:border-pmp-gray-500 transition-colors"
        >
          See Full Leaderboard →
        </Link>

        <Link
          href="/challenge/rankings"
          className="text-pmp-gray-600 text-xs text-center hover:text-pmp-gray-500 transition-colors"
        >
          View My Rankings
        </Link>
      </div>
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default async function ResultsPage() {
  const [session, season] = await Promise.all([getSession(), getCurrentSeason()])

  if (!session) {
    redirect('/challenge')
  }

  const db = getServiceClient()
  const userId = session.user.id
  const seasonId = season?.id ?? ''

  // Always fetch the user's accuracy score — needed for weekly card and final results
  const { data: rawScore } = seasonId
    ? await db
        .from('accuracy_scores')
        .select('overall_score, score_qb, score_rb, score_wr, score_te, global_rank, rank_change, current_week, computed_at')
        .eq('user_id', userId)
        .eq('season_id', seasonId)
        .maybeSingle()
    : { data: null }

  const scoreData = rawScore as AccuracyScoreRow | null

  // Final results view
  if (season?.status === 'scored') {
    const [detailResult, totalCountResult] = await Promise.all([
      db
        .from('ranking_score_detail')
        .select('position, player_id, player_name, user_rank, actual_rank, distance, final_score')
        .eq('user_id', userId)
        .eq('season_id', seasonId),

      db
        .from('accuracy_scores')
        .select('*', { count: 'exact', head: true })
        .eq('season_id', seasonId),
    ])

    const allDetail = (detailResult.data ?? []) as RankingScoreDetailRow[]
    const totalParticipants = totalCountResult.count ?? 0

    const positionResults: PositionResult[] = ORACLE_POSITIONS.map(pos => {
      const rows = allDetail.filter(r => r.position === pos)
      const players: PlayerScore[] = rows.map(r => ({
        playerId: r.player_id,
        playerName: r.player_name,
        userRank: r.user_rank,
        actualRank: r.actual_rank,
        distance: r.distance,
      }))

      const normalizedScore =
        pos === 'QB' ? (scoreData?.score_qb ?? 0)
        : pos === 'RB' ? (scoreData?.score_rb ?? 0)
        : pos === 'WR' ? (scoreData?.score_wr ?? 0)
        : (scoreData?.score_te ?? 0)

      return { position: pos, normalizedScore, players }
    })

    const overallScore = scoreData?.overall_score ?? 0
    const rank = scoreData?.global_rank ?? totalParticipants
    const percentile = computePercentile(rank, totalParticipants)
    const scoredAt = scoreData?.computed_at ?? null
    const oracleResult: OracleResult = { overallScore, positionResults }
    const summary = generateSummary(oracleResult)

    const allPlayers = positionResults.flatMap(pr => pr.players)
    const bestCall = allPlayers.length ? allPlayers.reduce((a, b) => (a.distance ?? 999) <= (b.distance ?? 999) ? a : b) : null
    const biggestMiss = allPlayers.length ? allPlayers.reduce((a, b) => (a.distance ?? 0) >= (b.distance ?? 0) ? a : b) : null

    return (
      <div className="min-h-[100dvh] bg-pmp-black px-4 py-12">
        <div className="max-w-md mx-auto flex flex-col gap-10">

          <div className="text-center flex flex-col items-center gap-2">
            <p className="text-pmp-red text-xs font-bold uppercase tracking-widest">2026 Oracle Challenge Results</p>
            <p className="text-pmp-white text-[72px] font-black leading-none">{overallScore.toFixed(1)}</p>
            <p className="text-pmp-gray-500 text-sm">Overall Accuracy</p>
            <div className="flex gap-4 mt-1">
              <span className="text-pmp-white font-bold text-sm">Top {percentile}%</span>
              <span className="text-pmp-gray-600 text-sm">#{rank} of {totalParticipants}</span>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">Position Breakdown</p>
            <div className="flex flex-col gap-3">
              {positionResults.map(pr => (
                <div key={pr.position} className="flex items-center gap-3">
                  <span className="text-pmp-gray-500 text-sm w-6">{pr.position}</span>
                  <div className="flex-1 h-2 bg-pmp-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-pmp-red rounded-full" style={{ width: `${pr.normalizedScore}%` }} />
                  </div>
                  <span className="text-pmp-white text-sm font-bold w-12 text-right">{pr.normalizedScore.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>

          {(bestCall || biggestMiss) && (
            <div className="flex flex-col gap-4">
              <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">Your Story</p>
              <div className="grid grid-cols-2 gap-3">
                {bestCall && (
                  <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-4 flex flex-col gap-1">
                    <p className="text-xs text-pmp-gray-600">🏆 Best Call</p>
                    <p className="text-pmp-white font-bold text-sm">{bestCall.playerName}</p>
                    <p className="text-pmp-gray-500 text-xs">You ranked #{bestCall.userRank} · Finished #{bestCall.actualRank ?? '—'}</p>
                    <p className="text-pmp-red text-xs font-bold">Distance: {bestCall.distance ?? '—'}</p>
                  </div>
                )}
                {biggestMiss && (
                  <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-4 flex flex-col gap-1">
                    <p className="text-xs text-pmp-gray-600">😬 Biggest Miss</p>
                    <p className="text-pmp-white font-bold text-sm">{biggestMiss.playerName}</p>
                    <p className="text-pmp-gray-500 text-xs">You ranked #{biggestMiss.userRank} · Finished #{biggestMiss.actualRank ?? '—'}</p>
                    <p className="text-pmp-gray-600 text-xs font-bold">Distance: {biggestMiss.distance ?? '—'}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">Season Summary</p>
            <p className="text-pmp-gray-500 text-sm leading-relaxed italic text-center">&ldquo;{summary}&rdquo;</p>
          </div>

          <div className="flex flex-col gap-4 items-center">
            <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest self-start">Share Your Results</p>
            <ResultsShareCard overallScore={overallScore} percentile={percentile} />
          </div>

          <div className="flex flex-col gap-4">
            <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">Timeline</p>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex gap-3 items-center">
                <span>📅</span>
                <span className="text-pmp-gray-600">Rankings locked:</span>
                <span className="text-pmp-white">
                  {season?.lock_at
                    ? new Date(season.lock_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
                    : 'Start of season'}
                </span>
              </div>
              <div className="flex gap-3 items-center">
                <span>🏁</span>
                <span className="text-pmp-gray-600">Season ended:</span>
                <span className="text-pmp-white">End of NFL season</span>
              </div>
              <div className="flex gap-3 items-center">
                <span>📊</span>
                <span className="text-pmp-gray-600">Scored:</span>
                <span className="text-pmp-white">
                  {scoredAt
                    ? new Date(scoredAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                    : 'January 2027'}
                </span>
              </div>
            </div>
          </div>

          <div className="text-center pb-4">
            <Link href="/challenge" className="text-pmp-gray-600 text-xs hover:text-pmp-gray-500 transition-colors">
              ← Back to Challenge
            </Link>
          </div>

        </div>
      </div>
    )
  }

  // Weekly scoring in progress — show rank card
  if (scoreData && scoreData.current_week > 0) {
    const { count: totalParticipants } = await db
      .from('accuracy_scores')
      .select('*', { count: 'exact', head: true })
      .eq('season_id', seasonId)

    return <WeeklyRankPage scoreData={scoreData} totalParticipants={totalParticipants ?? 0} />
  }

  // No scores yet
  return <HoldingPage />
}
