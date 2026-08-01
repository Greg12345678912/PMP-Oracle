import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth/server'
import { getCurrentSeason } from '@/lib/oracle/season'
import { ORACLE_LOCK_DATE, ORACLE_POSITIONS } from '@/lib/oracle/constants'
import { getPlayerStats } from '@/lib/oracle/playerStats'
import { getPlayerPool } from '@/lib/oracle/players'

export const dynamic = 'force-dynamic'

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  if (new Date() < ORACLE_LOCK_DATE) {
    const lockLabel = ORACLE_LOCK_DATE.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

    // Find player info from the pool
    const pools = await Promise.all(ORACLE_POSITIONS.map(pos => getPlayerPool(pos)))
    const allPlayers = pools.flat()
    const player = allPlayers.find(p => p.id === id)

    // Position rank = index in position-filtered pool + 1
    const posPool = pools[ORACLE_POSITIONS.indexOf((player?.position as typeof ORACLE_POSITIONS[number]) ?? 'QB')] ?? []
    const posRank = posPool.findIndex(p => p.id === id) + 1

    return (
      <div className="px-4 py-8 max-w-md mx-auto flex flex-col gap-6">
        {/* Player identity */}
        <div className="flex flex-col gap-1.5">
          <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">
            {player?.position ?? 'Player'} · {player?.team ?? ''}
          </p>
          <h1 className="text-pmp-white font-bold text-3xl">{player?.name ?? id}</h1>
          {posRank > 0 && (
            <p className="text-pmp-red text-sm font-semibold">
              #{posRank} {player?.position} · Current ADP
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
            <p className="text-pmp-gray-600 text-xs font-bold uppercase tracking-widest">After lock you&apos;ll see</p>
            {[
              'Average community rank',
              'Confidence breakdown',
              'Rank distribution chart',
              'Biggest believers vs. biggest fades',
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

  const [session, season] = await Promise.all([getSession(), getCurrentSeason()])

  if (!season) {
    return (
      <div className="min-h-[100dvh] bg-pmp-black flex items-center justify-center px-4">
        <p className="text-pmp-gray-500 text-sm text-center">No active season found.</p>
      </div>
    )
  }

  const stats = await getPlayerStats(id, season.id, session?.user.id ?? null)
  if (!stats) notFound()

  const { playerName, total, communityAvgRank, mostCommonRank, userRank, confidenceBreakdown } = stats

  const rankDelta =
    userRank !== null ? userRank - communityAvgRank : null

  return (
    <div className="min-h-[100dvh] bg-pmp-black text-pmp-white">
      {/* Header */}
      <div className="px-4 pt-12 pb-6 max-w-lg mx-auto">
        <p className="text-pmp-red text-xs font-bold uppercase tracking-[0.3em] mb-2">
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

        {/* Confidence breakdown */}
        <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-pmp-gray-500 text-xs uppercase tracking-widest">Confidence Breakdown</p>

          <ConfidenceBar label="High" pct={confidenceBreakdown.high} color="bg-pmp-red" />
          <ConfidenceBar label="Medium" pct={confidenceBreakdown.medium} color="bg-pmp-gray-600" />
          <ConfidenceBar label="Low" pct={confidenceBreakdown.low} color="bg-pmp-gray-700" />
        </div>

        <p className="text-pmp-gray-500 text-xs text-center">
          Rankings locked · {total} oracle{total === 1 ? '' : 's'} weighed in
        </p>
      </div>
    </div>
  )
}

function ConfidenceBar({
  label,
  pct,
  color,
}: {
  label: string
  pct: number
  color: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-pmp-gray-500">{label}</span>
        <span className="text-pmp-white font-medium">{pct}%</span>
      </div>
      <div className="h-2 bg-pmp-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
