import { notFound } from 'next/navigation'
import { getServiceClient } from '@/lib/league/db'
import { getSession } from '@/lib/auth/server'
import { getCurrentSeason } from '@/lib/oracle/season'
import { ORACLE_POSITIONS } from '@/lib/oracle/constants'
import { ORACLE_LOCK_DATE } from '@/lib/oracle/constants'
import { PREDICTION_QUESTIONS, getPredictions } from '@/lib/oracle/predictions'
import { generateSummary } from '@/lib/oracle/scoring'
import type { OracleResult, PositionResult, PlayerScore } from '@/lib/oracle/scoring'
import { ProfileClient } from './client'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ username: string }>
}

// ─── DB row types ────────────────────────────────────────────────────────────

interface UserProfileRow {
  user_id: string
  username: string
  display_name: string
  is_public: boolean
  is_verified: boolean
  is_creator: boolean
  avatar_url: string | null
  oracle_score?: number | null
  accuracy_rating: number | null
}

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

interface ChallengeRankingRow {
  position: string
  rankings: unknown
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computePercentile(rank: number, total: number): number {
  if (total <= 1) return 1
  return Math.max(1, Math.round(((total - rank + 1) / total) * 100))
}

function isRankingRowArray(
  value: unknown,
): value is Array<{ playerRank: number; playerId: string; playerName: string; confidence: string }> {
  if (!Array.isArray(value)) return false
  return value.every(
    item =>
      item !== null &&
      typeof item === 'object' &&
      typeof (item as Record<string, unknown>).playerRank === 'number' &&
      typeof (item as Record<string, unknown>).playerId === 'string' &&
      typeof (item as Record<string, unknown>).playerName === 'string',
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function UserProfilePage({ params }: PageProps) {
  const { username } = await params
  const db = getServiceClient()

  const { data: profileData } = await db
    .from('user_profiles')
    .select('user_id, username, display_name, is_public, is_verified, is_creator, avatar_url, accuracy_rating')
    .eq('username', username)
    .maybeSingle()

  const profile = profileData as UserProfileRow | null

  // 404 if not found OR profile is private
  if (!profile || profile.is_public === false) {
    notFound()
  }

  const [session, season] = await Promise.all([getSession(), getCurrentSeason()])
  const isOwn = session?.user.id === profile.user_id

  const isAfterLock = new Date() >= ORACLE_LOCK_DATE
  const isScored = season?.status === 'scored'

  // Fetch all data in parallel
  const [accResult, detailResult, rankingRowsResult, totalCountResult, predictionsData] =
    await Promise.all([
      // Accuracy scores (only meaningful if scored)
      isScored && season
        ? db
            .from('accuracy_scores')
            .select('overall_score, score_qb, score_rb, score_wr, score_te, global_rank, computed_at')
            .eq('user_id', profile.user_id)
            .eq('season_id', season.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),

      // Ranking score detail (only if scored)
      isScored && season
        ? db
            .from('ranking_score_detail')
            .select('position, player_id, player_name, user_rank, actual_rank, distance, raw_score, confidence, final_score')
            .eq('user_id', profile.user_id)
            .eq('season_id', season.id)
        : Promise.resolve({ data: [] }),

      // Raw rankings (shown after lock, whether or not scored)
      isAfterLock && season
        ? db
            .from('challenge_rankings')
            .select('position, rankings')
            .eq('user_id', profile.user_id)
            .eq('season_id', season.id)
        : Promise.resolve({ data: [] }),

      // Total participant count (for percentile)
      isScored && season
        ? db
            .from('accuracy_scores')
            .select('*', { count: 'exact', head: true })
            .eq('season_id', season.id)
        : Promise.resolve({ count: 0 }),

      // Predictions (shown after lock)
      isAfterLock && season
        ? getPredictions(db, profile.user_id, season.id)
        : Promise.resolve([]),
    ])

  const scoreData = (accResult.data as AccuracyScoreRow | null) ?? null
  const allDetail = ((detailResult.data ?? []) as RankingScoreDetailRow[])
  const rawRankingRows = ((rankingRowsResult.data ?? []) as ChallengeRankingRow[])
  const totalParticipants = (totalCountResult as { count: number | null }).count ?? 0

  // Build position results from score detail (scored view)
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

  // Build preview picks (first 3 per position from raw rankings, visible after lock)
  const rankingPreview: Record<string, Array<{ playerRank: number; playerName: string; confidence: string }>> = {}
  for (const pos of ORACLE_POSITIONS) {
    const row = rawRankingRows.find(r => r.position === pos)
    if (row) {
      const parsed: unknown =
        typeof row.rankings === 'string' ? JSON.parse(row.rankings) : row.rankings
      const arr = isRankingRowArray(parsed) ? parsed : []
      rankingPreview[pos] = arr
        .sort((a, b) => a.playerRank - b.playerRank)
        .slice(0, 3)
        .map(r => ({ playerRank: r.playerRank, playerName: r.playerName, confidence: r.confidence }))
    } else {
      rankingPreview[pos] = []
    }
  }

  // Summary + percentile
  const overallScore = scoreData?.overall_score ?? null
  const rank = scoreData?.global_rank ?? null
  const percentile = overallScore !== null && rank !== null
    ? computePercentile(rank, totalParticipants)
    : null

  const lockDateLabel = ORACLE_LOCK_DATE.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' })

  const oracleResult: OracleResult | null =
    isScored && scoreData
      ? { overallScore: scoreData.overall_score, positionResults }
      : null

  const summary = oracleResult ? generateSummary(oracleResult) : null

  return (
    <ProfileClient
      profile={{
        username: profile.username,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        isVerified: profile.is_verified,
        isCreator: profile.is_creator,
      }}
      isOwn={isOwn}
      isAfterLock={isAfterLock}
      isScored={isScored}
      overallScore={overallScore}
      percentile={percentile}
      positionResults={isScored ? positionResults : []}
      summary={summary}
      rankingPreview={rankingPreview}
      predictions={predictionsData}
      lockDateLabel={lockDateLabel}
    />
  )
}
