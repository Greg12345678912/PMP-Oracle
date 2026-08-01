import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth/server'
import { getCurrentSeason } from '@/lib/oracle/season'
import { ORACLE_LOCK_DATE } from '@/lib/oracle/constants'
import { getPlayerStats } from '@/lib/oracle/playerStats'

export const dynamic = 'force-dynamic'

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  if (new Date() < ORACLE_LOCK_DATE) {
    return (
      <div className="min-h-[100dvh] bg-pmp-black flex items-center justify-center px-4">
        <p className="text-pmp-gray-500 text-sm text-center">
          Community rankings are revealed after the season locks on September&nbsp;9, 2026.
        </p>
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
