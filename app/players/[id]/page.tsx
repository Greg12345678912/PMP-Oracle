import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth/server'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { ORACLE_POSITIONS } from '@/lib/oracle/constants'
import { getPlayerStats } from '@/lib/oracle/playerStats'
import { getPlayerPool } from '@/lib/oracle/players'
import { getServiceClient } from '@/lib/league/db'
import { getPreviewState, mockSeason } from '@/lib/oracle/dev-preview'

export const dynamic = 'force-dynamic'

// Mock player ranks for preview locked state (one per position)
const PREVIEW_MOCK_RANKS: Record<string, number> = { QB: 3, RB: 5, WR: 2, TE: 4 }

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const previewState = await getPreviewState()
  const [session, rawSeason] = await Promise.all([getSession(), getCurrentSeason()])
  const season = previewState ? mockSeason(previewState) : rawSeason

  // ── Pre-lock state ──────────────────────────────────────────────────────────
  if (!season || !isLocked(season)) {
    const lockLabel = season
      ? new Date(season.lock_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
      : 'the deadline'

    const pools = await Promise.all(ORACLE_POSITIONS.map(pos => getPlayerPool(pos)))
    const allPlayers = pools.flat()
    const player = allPlayers.find(p => p.id === id)
    const posPool = pools[ORACLE_POSITIONS.indexOf((player?.position as typeof ORACLE_POSITIONS[number]) ?? 'QB')] ?? []
    const posRank = posPool.findIndex(p => p.id === id) + 1

    return (
      <div className="px-4 py-8 max-w-md mx-auto flex flex-col gap-6">
        <Link href="/players" className="text-pmp-gray-600 text-xs hover:text-pmp-gray-500 transition-colors">← Back to Players</Link>
        {/* Player identity */}
        <div className="flex flex-col gap-1.5">
          <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">
            {player?.position ?? 'Player'} · {player?.team ?? ''}
          </p>
          <h1 className="text-pmp-white font-bold text-3xl">{player?.name ?? id}</h1>
          {posRank > 0 && (
            <p className="text-pmp-red text-sm font-semibold">
              #{posRank} {player?.position} · 2026 Oracle Pool
            </p>
          )}
        </div>

        {/* Lock teaser card */}
        <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-5 py-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-pmp-white font-bold text-base">Community Rankings</p>
            <p className="text-pmp-gray-500 text-sm">
              Unlocks {lockLabel} after rankings lock
            </p>
          </div>
          <div className="h-px bg-pmp-gray-800" />
          <div className="flex flex-col gap-2">
            <p className="text-pmp-gray-600 text-xs font-bold uppercase tracking-widest">Coming after kickoff</p>
            {[
              'Average community rank',
              'Biggest believers & biggest fades',
              'Rank distribution',
              'Community consensus',
            ].map(item => (
              <div key={item} className="flex items-center gap-2">
                <span className="text-pmp-gray-700 text-sm">·</span>
                <span className="text-pmp-gray-500 text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA to rank this player */}
        <a
          href="/challenge/rankings"
          className="w-full bg-pmp-red text-pmp-white font-bold py-3.5 rounded-xl text-sm text-center hover:opacity-90 transition-opacity"
        >
          Rank {player?.name?.split(' ')[1] ?? 'This Player'} Now
        </a>
      </div>
    )
  }

  // ── Determine if weekly scoring has started ─────────────────────────────────
  const hasWeeklyScores = season.status === 'scoring' || season.status === 'scored'

  // ── Locked, pre-Week-1 state ────────────────────────────────────────────────
  if (!hasWeeklyScores) {
    const pools = await Promise.all(ORACLE_POSITIONS.map(pos => getPlayerPool(pos)))
    const allPlayers = pools.flat()
    const player = allPlayers.find(p => p.id === id)
    const pos = (player?.position ?? 'QB') as typeof ORACLE_POSITIONS[number]

    // Resolve user's locked ranking for this player
    // Always query the real DB (using rawSeason.id) so preview shows actual submitted rankings.
    // Fall back to mock values only if no real data exists.
    let userRankLabel: string | null = null
    if (session && rawSeason) {
      const db = getServiceClient()
      const { data } = await db
        .from('challenge_rankings')
        .select('rankings')
        .eq('user_id', session.user.id)
        .eq('season_id', rawSeason.id)
        .eq('position', pos)
        .maybeSingle()
      if (data?.rankings) {
        const parsed: unknown = typeof data.rankings === 'string'
          ? JSON.parse(data.rankings)
          : data.rankings
        if (Array.isArray(parsed)) {
          const entry = (parsed as Array<{ playerRank: number; playerId: string }>).find(r => r.playerId === id)
          if (entry) userRankLabel = `#${entry.playerRank} ${pos}`
        }
      }
    }
    // Fall back to mock only if in preview and no real submission found
    if (!userRankLabel && previewState) {
      const mockRank = PREVIEW_MOCK_RANKS[pos]
      if (mockRank) userRankLabel = `#${mockRank} ${pos}`
    }

    return (
      <div className="px-4 py-8 max-w-md mx-auto flex flex-col gap-6">
        <Link href="/players" className="text-pmp-gray-600 text-xs hover:text-pmp-gray-500 transition-colors">← Back to Players</Link>
        {/* Player identity */}
        <div className="flex flex-col gap-1.5">
          <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">
            {player?.position ?? 'Player'} · {player?.team ?? ''}
          </p>
          <h1 className="text-pmp-white font-bold text-3xl">{player?.name ?? id}</h1>
        </div>

        {/* User's locked ranking */}
        {session && (
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-5 py-5 flex flex-col gap-1">
            <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">Your Oracle Ranking</p>
            {userRankLabel ? (
              <p className="text-pmp-white font-bold text-2xl">{userRankLabel}</p>
            ) : (
              <p className="text-pmp-gray-500 text-sm">Not in your Oracle entry</p>
            )}
          </div>
        )}

        {/* Community rankings teaser */}
        <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-5 py-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-pmp-white font-bold text-base">Community Rankings</p>
            <p className="text-pmp-gray-500 text-sm">Unlocking after Week 1 scoring</p>
          </div>
          <div className="h-px bg-pmp-gray-800" />
          <div className="flex flex-col gap-2">
            <p className="text-pmp-gray-600 text-xs font-bold uppercase tracking-widest">Coming after kickoff</p>
            {[
              'Average community rank',
              'Biggest believers & biggest fades',
              'Rank distribution',
              'Community consensus',
            ].map(item => (
              <div key={item} className="flex items-center gap-2">
                <span className="text-pmp-gray-700 text-sm">·</span>
                <span className="text-pmp-gray-500 text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Post-Week-1 / scored state ──────────────────────────────────────────────
  // Always use the real season ID for data lookups — mock season IDs have no rows in challenge_rankings
  const realSeasonId = rawSeason?.id ?? season.id
  const stats = await getPlayerStats(id, realSeasonId, session?.user.id ?? null)

  // If no community stats exist yet (e.g. preview with no real data, or obscure player),
  // render a graceful no-data view rather than a 404.
  if (!stats) {
    const pools = await Promise.all(ORACLE_POSITIONS.map(pos => getPlayerPool(pos)))
    const fallbackPlayer = pools.flat().find(p => p.id === id)
    if (!fallbackPlayer) notFound()
    return (
      <div className="min-h-[100dvh] bg-pmp-black text-pmp-white">
        <div className="px-4 pt-8 pb-6 max-w-lg mx-auto">
          <Link href="/players" className="text-pmp-gray-600 text-xs hover:text-pmp-gray-500 transition-colors">← Back to Players</Link>
          <p className="text-pmp-red text-xs font-bold uppercase tracking-[0.3em] mt-4 mb-2">The Oracle Challenge</p>
          <h1 className="text-2xl font-bold leading-tight">{fallbackPlayer!.name}</h1>
          <p className="text-pmp-gray-500 text-sm mt-1">Community Rankings</p>
        </div>
        <div className="px-4 max-w-lg mx-auto pb-16">
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-4 py-5 text-center">
            <p className="text-pmp-gray-500 text-sm">No community rankings yet for this player.</p>
          </div>
        </div>
      </div>
    )
  }

  const { playerName, total, communityAvgRank, mostCommonRank, userRank } = stats

  const rankDelta =
    userRank !== null ? userRank - communityAvgRank : null

  return (
    <div className="min-h-[100dvh] bg-pmp-black text-pmp-white">
      {/* Header */}
      <div className="px-4 pt-8 pb-6 max-w-lg mx-auto">
        <Link href="/players" className="text-pmp-gray-600 text-xs hover:text-pmp-gray-500 transition-colors">← Back to Players</Link>
        <p className="text-pmp-red text-xs font-bold uppercase tracking-[0.3em] mt-4 mb-2">
          The Oracle Challenge
        </p>
        <h1 className="text-2xl font-bold leading-tight">{playerName}</h1>
        <p className="text-pmp-gray-500 text-sm mt-1">
          Community Rankings · {total} {total === 1 ? 'submission' : 'submissions'}
        </p>
      </div>

      <div className="px-4 max-w-lg mx-auto flex flex-col gap-4 pb-16">
        {/* Rank cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-4 flex flex-col gap-1">
            <p className="text-pmp-gray-500 text-xs uppercase tracking-widest">Community Avg</p>
            <p className="text-pmp-white text-3xl font-bold">#{communityAvgRank}</p>
          </div>

          {mostCommonRank !== null && (
            <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-4 flex flex-col gap-1">
              <p className="text-pmp-gray-500 text-xs uppercase tracking-widest">Most Common</p>
              <p className="text-pmp-white text-3xl font-bold">#{mostCommonRank}</p>
            </div>
          )}
        </div>

        {/* Your rank */}
        {session && (
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-4 flex items-center justify-between min-h-[44px]">
            <div>
              <p className="text-pmp-gray-500 text-xs uppercase tracking-widest mb-1">Your Rank</p>
              {userRank !== null ? (
                <p className="text-pmp-white text-2xl font-bold">#{userRank}</p>
              ) : (
                <p className="text-pmp-gray-500 text-sm">Not ranked by you</p>
              )}
            </div>
            {rankDelta !== null && (
              <div className="text-right">
                <p className="text-pmp-gray-500 text-xs uppercase tracking-widest mb-1">vs Community</p>
                <p
                  className={
                    rankDelta === 0
                      ? 'text-pmp-white text-lg font-semibold'
                      : rankDelta < 0
                        ? 'text-pmp-red text-lg font-semibold'
                        : 'text-pmp-gray-500 text-lg font-semibold'
                  }
                >
                  {rankDelta === 0 ? 'Exact match' : rankDelta < 0 ? `${Math.abs(rankDelta)} higher` : `${rankDelta} lower`}
                </p>
              </div>
            )}
          </div>
        )}

        <p className="text-pmp-gray-500 text-xs text-center">
          Rankings locked · {total} oracle{total === 1 ? '' : 's'} weighed in
        </p>
      </div>
    </div>
  )
}
