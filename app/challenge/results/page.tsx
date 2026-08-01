import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/server'
import { getCurrentSeason } from '@/lib/oracle/season'
import { getServiceClient } from '@/lib/league/db'
import { ORACLE_POSITIONS } from '@/lib/oracle/constants'
import { PREDICTION_QUESTIONS, getPredictions } from '@/lib/oracle/predictions'
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
  computed_at: string | null
}

interface RankingScoreDetailRow {
  position: string
  player_id: string
  player_name: string
  user_rank: number
  actual_rank: number | null
  distance: number | null
  raw_score: number
  confidence: string
  final_score: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function computePercentile(rank: number, total: number): number {
  if (total <= 1) return 1
  // "Top X%" — lower rank number = better
  return Math.max(1, Math.round(((total - rank + 1) / total) * 100))
}

// ─── Holding page ───────────────────────────────────────────────────────────

function HoldingPage() {
  return (
    <div className="min-h-[100dvh] bg-pmp-black flex flex-col items-center justify-center px-4 text-center gap-6">
      <p className="text-pmp-red text-xs font-bold uppercase tracking-widest">
        2026 Oracle Challenge
      </p>
      <h1 className="text-pmp-white font-bold text-2xl">First scores drop September 15.</h1>
      <p className="text-pmp-gray-500 text-sm">
        After Week 1, your picks start earning points. Come back September 15 to see where you stand.
      </p>
      <Link
        href="/challenge/rankings"
        className="text-pmp-red text-sm font-semibold hover:opacity-80"
      >
        See my picks →
      </Link>
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default async function ResultsPage() {
  const [session, season] = await Promise.all([getSession(), getCurrentSeason()])

  if (!session) {
    redirect('/challenge')
  }

  if (!season || season.status !== 'scored') {
    return <HoldingPage />
  }

  const db = getServiceClient()
  const userId = session.user.id
  const seasonId = season.id

  // Fetch all data in parallel
  const [accResult, detailResult, predictions, totalCountResult] = await Promise.all([
    db
      .from('accuracy_scores')
      .select('overall_score, score_qb, score_rb, score_wr, score_te, global_rank, computed_at')
      .eq('user_id', userId)
      .eq('season_id', seasonId)
      .maybeSingle(),

    db
      .from('ranking_score_detail')
      .select(
        'position, player_id, player_name, user_rank, actual_rank, distance, raw_score, confidence, final_score',
      )
      .eq('user_id', userId)
      .eq('season_id', seasonId),

    getPredictions(db, userId, seasonId),

    db
      .from('accuracy_scores')
      .select('*', { count: 'exact', head: true })
      .eq('season_id', seasonId),
  ])

  const scoreData = accResult.data as AccuracyScoreRow | null
  const allDetail = (detailResult.data ?? []) as RankingScoreDetailRow[]
  const totalParticipants = totalCountResult.count ?? 0

  // Build position results from detail rows
  const positionResults: PositionResult[] = ORACLE_POSITIONS.map(pos => {
    const rows = allDetail.filter(r => r.position === pos)
    const players: PlayerScore[] = rows.map(r => ({
      playerId: r.player_id,
      playerName: r.player_name,
      userRank: r.user_rank,
      actualRank: r.actual_rank,
      distance: r.distance,
      rawScore: r.raw_score,
      confidence: r.confidence,
      finalPoints: r.final_score,
    }))

    const normalizedScore =
      pos === 'QB'
        ? (scoreData?.score_qb ?? 0)
        : pos === 'RB'
          ? (scoreData?.score_rb ?? 0)
          : pos === 'WR'
            ? (scoreData?.score_wr ?? 0)
            : (scoreData?.score_te ?? 0)

    return { position: pos, normalizedScore, players }
  })

  const overallScore = scoreData?.overall_score ?? 0
  const rank = scoreData?.global_rank ?? totalParticipants
  const percentile = computePercentile(rank, totalParticipants)
  const scoredAt = scoreData?.computed_at ?? null

  const oracleResult: OracleResult = { overallScore, positionResults }
  const summary = generateSummary(oracleResult)

  // Best call / biggest miss across all positions
  const allPlayers = positionResults.flatMap(pr => pr.players)
  const bestCall = allPlayers.length
    ? allPlayers.reduce((a, b) => (a.finalPoints >= b.finalPoints ? a : b))
    : null
  const biggestMiss = allPlayers.length
    ? allPlayers.reduce((a, b) => (a.finalPoints <= b.finalPoints ? a : b))
    : null

  return (
    <div className="min-h-[100dvh] bg-pmp-black px-4 py-12">
      <div className="max-w-md mx-auto flex flex-col gap-10">

        {/* 1. Hero */}
        <div className="text-center flex flex-col items-center gap-2">
          <p className="text-pmp-red text-xs font-bold uppercase tracking-widest">
            2026 Oracle Challenge Results
          </p>
          <p className="text-pmp-white text-[72px] font-black leading-none">
            {overallScore.toFixed(1)}
          </p>
          <p className="text-pmp-gray-500 text-sm">Overall Accuracy</p>
          <div className="flex gap-4 mt-1">
            <span className="text-pmp-white font-bold text-sm">Top {percentile}%</span>
            <span className="text-pmp-gray-600 text-sm">
              #{rank} of {totalParticipants}
            </span>
          </div>
        </div>

        {/* 2. Position Breakdown */}
        <div className="flex flex-col gap-4">
          <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">
            Position Breakdown
          </p>
          <div className="flex flex-col gap-3">
            {positionResults.map(pr => (
              <div key={pr.position} className="flex items-center gap-3">
                <span className="text-pmp-gray-500 text-sm w-6">{pr.position}</span>
                <div className="flex-1 h-2 bg-pmp-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-pmp-red rounded-full"
                    style={{ width: `${pr.normalizedScore}%` }}
                  />
                </div>
                <span className="text-pmp-white text-sm font-bold w-12 text-right">
                  {pr.normalizedScore.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Your Story */}
        {(bestCall || biggestMiss) && (
          <div className="flex flex-col gap-4">
            <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">
              Your Story
            </p>
            <div className="grid grid-cols-2 gap-3">
              {bestCall && (
                <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-4 flex flex-col gap-1">
                  <p className="text-xs text-pmp-gray-600">🏆 Best Call</p>
                  <p className="text-pmp-white font-bold text-sm">{bestCall.playerName}</p>
                  <p className="text-pmp-gray-500 text-xs">
                    You ranked #{bestCall.userRank} · Finished #
                    {bestCall.actualRank ?? '—'}
                  </p>
                  <p className="text-pmp-red text-xs font-bold">
                    +{bestCall.finalPoints.toFixed(0)} pts
                  </p>
                </div>
              )}
              {biggestMiss && (
                <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-4 flex flex-col gap-1">
                  <p className="text-xs text-pmp-gray-600">😬 Biggest Miss</p>
                  <p className="text-pmp-white font-bold text-sm">{biggestMiss.playerName}</p>
                  <p className="text-pmp-gray-500 text-xs">
                    You ranked #{biggestMiss.userRank} · Finished #
                    {biggestMiss.actualRank ?? '—'}
                  </p>
                  <p className="text-pmp-gray-600 text-xs font-bold">
                    +{biggestMiss.finalPoints.toFixed(0)} pts
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. Prediction Results */}
        {predictions.length > 0 && (
          <div className="flex flex-col gap-4">
            <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">
              Prediction Results
            </p>
            <div className="grid grid-cols-2 gap-2">
              {predictions.map(pred => (
                <div
                  key={pred.questionId}
                  className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-3 py-3 flex items-center gap-2"
                >
                  <span>
                    {pred.isCorrect === true
                      ? '✅'
                      : pred.isCorrect === false
                        ? '❌'
                        : '⏳'}
                  </span>
                  <div>
                    <p className="text-pmp-gray-500 text-xs">
                      {PREDICTION_QUESTIONS.find(q => q.id === pred.questionId)?.label}
                    </p>
                    <p className="text-pmp-white text-xs font-semibold">{pred.answer}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. Season Summary */}
        <div className="flex flex-col gap-4">
          <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">
            Season Summary
          </p>
          <p className="text-pmp-gray-500 text-sm leading-relaxed italic text-center">
            &ldquo;{summary}&rdquo;
          </p>
        </div>

        {/* 6. Share Card */}
        <div className="flex flex-col gap-4 items-center">
          <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest self-start">
            Share Your Results
          </p>
          <ResultsShareCard overallScore={overallScore} percentile={percentile} />
        </div>

        {/* 7. Timeline */}
        <div className="flex flex-col gap-4">
          <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">
            Timeline
          </p>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex gap-3 items-center">
              <span>📅</span>
              <span className="text-pmp-gray-600">Rankings locked:</span>
              <span className="text-pmp-white">September 9, 2026</span>
            </div>
            <div className="flex gap-3 items-center">
              <span>🏁</span>
              <span className="text-pmp-gray-600">Season ended:</span>
              <span className="text-pmp-white">January 2027</span>
            </div>
            <div className="flex gap-3 items-center">
              <span>📊</span>
              <span className="text-pmp-gray-600">Scored:</span>
              <span className="text-pmp-white">
                {scoredAt
                  ? new Date(scoredAt).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'January 2027'}
              </span>
            </div>
          </div>
        </div>

        {/* Back link */}
        <div className="text-center pb-4">
          <Link
            href="/challenge"
            className="text-pmp-gray-600 text-xs hover:text-pmp-gray-500 transition-colors"
          >
            ← Back to Challenge
          </Link>
        </div>

      </div>
    </div>
  )
}
