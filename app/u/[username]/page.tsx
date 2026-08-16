import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServiceClient } from '@/lib/league/db'
import { getSession } from '@/lib/auth/server'
import { getCurrentSeason } from '@/lib/oracle/season'
import { ORACLE_POSITIONS } from '@/lib/oracle/constants'
import { isLocked } from '@/lib/oracle/season'
import { generateSummary } from '@/lib/oracle/scoring'
import type { OracleResult, PositionResult, PlayerScore } from '@/lib/oracle/scoring'
import { ProfileClient } from './client'
import {
  getPreviewState,
  mockSeason,
  mockAccuracyScore,
  mockDetailRows,
  mockRawRankings,
  generatePreviewLeaderboardScores,
  MOCK_TOTAL_PARTICIPANTS,
  type PreviewState,
} from '@/lib/oracle/dev-preview'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params
  return { title: `@${username}` }
}

interface PageProps {
  params: Promise<{ username: string }>
  searchParams: Promise<{ preview_rank?: string }>
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
  current_week: number | null
  computed_at: string | null
}

interface RankingScoreDetailRow {
  position: string
  player_id: string
  player_name: string
  user_rank: number
  actual_rank: number | null
  distance: number | null
}

interface ChallengeRankingRow {
  position: string
  rankings: unknown
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computePercentile(rank: number, total: number): number {
  if (total <= 1) return 1
  return Math.max(1, Math.min(100, Math.round((rank / total) * 100)))
}

function isRankingRowArray(
  value: unknown,
): value is Array<{ playerRank: number; playerId: string; playerName: string }> {
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

export default async function UserProfilePage({ params, searchParams }: PageProps) {
  const [{ username }, { preview_rank }] = await Promise.all([params, searchParams])
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

  const previewState = await getPreviewState()
  const [session, rawSeason] = await Promise.all([getSession(), getCurrentSeason()])
  const season = previewState ? mockSeason(previewState) : rawSeason
  const isOwn = session?.user.id === profile.user_id

  const isAfterLock = season ? isLocked(season) : false
  const isScored = season?.status === 'scored'

  // ── Preview mode: substitute mock score data ──────────────────────────────
  if (previewState) {
    const baseScore = mockAccuracyScore(previewState)
    const hasInSeasonScores = (baseScore?.current_week ?? 0) > 0
    const showScores = (previewState === 'scored') || hasInSeasonScores
    const totalParticipants = MOCK_TOTAL_PARTICIPANTS

    // For non-own profiles arriving from the generated leaderboard, derive a
    // per-rank score by proportionally scaling the mock position breakdowns so
    // their average equals the entry's overall score.
    const previewRankNum = preview_rank ? parseInt(preview_rank, 10) : null
    const usePerRankScore = showScores && previewRankNum !== null && !isOwn && baseScore

    let previewScore = baseScore
    if (usePerRankScore && baseScore) {
      const genEntries = generatePreviewLeaderboardScores(previewState as Exclude<PreviewState, 'locked'>)
      const entry = genEntries.find(e => e.rank === previewRankNum)
      if (entry) {
        const scale = baseScore.overall_score > 0 ? entry.overall_score / baseScore.overall_score : 1
        previewScore = {
          ...baseScore,
          overall_score: entry.overall_score,
          score_qb: Math.min(100, parseFloat((baseScore.score_qb * scale).toFixed(1))),
          score_rb: Math.min(100, parseFloat((baseScore.score_rb * scale).toFixed(1))),
          score_wr: Math.min(100, parseFloat((baseScore.score_wr * scale).toFixed(1))),
          score_te: Math.min(100, parseFloat((baseScore.score_te * scale).toFixed(1))),
          global_rank: previewRankNum,
          rank_change: null,
        }
      }
    }

    const allDetail = showScores ? mockDetailRows() : []

    // Query real submitted rankings from DB (rawSeason.id = real season ID).
    // This ensures the profile shows the user's actual submitted rankings, not mock data.
    const rawRankingRows: ChallengeRankingRow[] = []
    if (isAfterLock && rawSeason) {
      const { data: realRankingData } = await db
        .from('challenge_rankings')
        .select('position, rankings')
        .eq('user_id', profile.user_id)
        .eq('season_id', rawSeason.id)
      if (realRankingData) rawRankingRows.push(...(realRankingData as ChallengeRankingRow[]))
    }

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
        pos === 'QB' ? (previewScore?.score_qb ?? 0)
        : pos === 'RB' ? (previewScore?.score_rb ?? 0)
        : pos === 'WR' ? (previewScore?.score_wr ?? 0)
        : (previewScore?.score_te ?? 0)
      return { position: pos, normalizedScore, players }
    })

    // Build ranking preview — real data first, fall back to mock rankings so
    // preview profiles never show "No rankings submitted."
    const mockRankingFallback = mockRawRankings()
    const rankingPreview: Record<string, Array<{ playerRank: number; playerName: string }>> = {}
    for (const pos of ORACLE_POSITIONS) {
      const row = rawRankingRows.find(r => r.position === pos)
      if (row) {
        const parsed: unknown = typeof row.rankings === 'string' ? JSON.parse(row.rankings) : row.rankings
        const arr = isRankingRowArray(parsed) ? parsed : []
        rankingPreview[pos] = arr.sort((a, b) => a.playerRank - b.playerRank).slice(0, 10)
          .map(r => ({ playerRank: r.playerRank, playerName: r.playerName }))
      } else {
        // No real submission for this position — show mock picks
        const fallbackPos = mockRankingFallback.find(m => m.position === pos)
        const fallbackArr = Array.isArray(fallbackPos?.rankings)
          ? (fallbackPos.rankings as Array<{ playerRank: number; playerId: string; playerName: string }>)
          : []
        rankingPreview[pos] = fallbackArr.slice(0, 10).map(r => ({ playerRank: r.playerRank, playerName: r.playerName }))
      }
    }

    const overallScore = previewScore?.overall_score ?? null
    const rank = previewScore?.global_rank ?? null
    const percentile = overallScore !== null && rank !== null
      ? computePercentile(rank, totalParticipants)
      : null

    const oracleResult: OracleResult | null =
      showScores && previewScore
        ? { overallScore: previewScore.overall_score, positionResults }
        : null

    const summary = oracleResult ? generateSummary(oracleResult) : null
    // Use the real season's lock_at so the date always reflects the actual lock date (e.g. Sept. 9),
    // not the rolling mock date. Fall back to mock season if no real season exists.
    const lockDateLabel = new Date((rawSeason ?? season!).lock_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' })

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
        isScored={showScores}
        isSeasonComplete={previewState === 'scored'}
        overallScore={overallScore}
        percentile={percentile}
        rank={rank}
        totalParticipants={totalParticipants}
        positionResults={showScores ? positionResults : []}
        summary={summary}
        rankingPreview={rankingPreview}
        lockDateLabel={lockDateLabel}
      />
    )
  }
  // ── End preview mode ─────────────────────────────────────────────────────

  // Fetch all data in parallel
  const [accResult, detailResult, rankingRowsResult, totalCountResult] =
    await Promise.all([
      // Accuracy scores — always fetch if season exists; display gated on current_week > 0
      season
        ? db
            .from('accuracy_scores')
            .select('overall_score, score_qb, score_rb, score_wr, score_te, global_rank, current_week, computed_at')
            .eq('user_id', profile.user_id)
            .eq('season_id', season.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),

      // Ranking score detail — show when in-season scores exist or fully scored
      season
        ? db
            .from('ranking_score_detail')
            .select('position, player_id, player_name, user_rank, actual_rank, distance')
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

      // Total participant count (for percentile) — show when scores exist
      season
        ? db
            .from('accuracy_scores')
            .select('*', { count: 'exact', head: true })
            .eq('season_id', season.id)
        : Promise.resolve({ count: 0 }),
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
  const rankingPreview: Record<string, Array<{ playerRank: number; playerName: string }>> = {}
  for (const pos of ORACLE_POSITIONS) {
    const row = rawRankingRows.find(r => r.position === pos)
    if (row) {
      const parsed: unknown =
        typeof row.rankings === 'string' ? JSON.parse(row.rankings) : row.rankings
      const arr = isRankingRowArray(parsed) ? parsed : []
      rankingPreview[pos] = arr
        .sort((a, b) => a.playerRank - b.playerRank)
        .slice(0, 10)
        .map(r => ({ playerRank: r.playerRank, playerName: r.playerName }))
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

  const lockDateLabel = season
    ? new Date(season.lock_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' })
    : 'the deadline'

  // Show scores if: season fully scored OR pipeline has run at least 1 week
  const hasInSeasonScores = (scoreData?.current_week ?? 0) > 0
  const showScores = isScored || hasInSeasonScores

  const oracleResult: OracleResult | null =
    showScores && scoreData
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
      isScored={showScores}
      isSeasonComplete={isScored}
      overallScore={overallScore}
      percentile={percentile}
      rank={rank}
      totalParticipants={totalParticipants}
      positionResults={showScores ? positionResults : []}
      summary={summary}
      rankingPreview={rankingPreview}
      lockDateLabel={lockDateLabel}
    />
  )
}
