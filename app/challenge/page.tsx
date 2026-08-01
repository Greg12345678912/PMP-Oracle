import Link from 'next/link'
import { getSession } from '@/lib/auth/server'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { getServiceClient } from '@/lib/league/db'
import { getRankings } from '@/lib/oracle/rankings'
import { ORACLE_POSITIONS, ORACLE_LOCK_DATE, POSITION_LIST_SIZE } from '@/lib/oracle/constants'
import type { OraclePosition } from '@/lib/oracle/constants'
import { Countdown } from '@/components/oracle/Countdown'

export const dynamic = 'force-dynamic'

function daysUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
}

export default async function ChallengePage() {
  const [session, season] = await Promise.all([getSession(), getCurrentSeason()])
  const locked = season ? isLocked(season) : true
  const daysLeft = daysUntil(ORACLE_LOCK_DATE)

  /* ─── Signed-in data ─────────────────────────────────────────────── */
  let displayName: string | null = null
  let rankingCounts: Record<OraclePosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 }
  let isSubmitted = false
  let totalEntries = 0

  if (session && season) {
    const db = getServiceClient()
    const [profileResult, submittedResult, entryCountResult, ...rankingResults] =
      await Promise.all([
        db
          .from('user_profiles')
          .select('display_name')
          .eq('user_id', session.user.id)
          .maybeSingle(),
        db
          .from('challenge_rankings')
          .select('is_submitted')
          .eq('user_id', session.user.id)
          .eq('season_id', season.id)
          .limit(1)
          .maybeSingle(),
        db
          .from('challenge_rankings')
          .select('user_id', { count: 'exact', head: true })
          .eq('season_id', season.id)
          .eq('is_submitted', true),
        ...ORACLE_POSITIONS.map(pos => getRankings(session.user.id, season.id, pos)),
      ])

    displayName = (profileResult.data?.display_name as string | null) ?? null
    isSubmitted = submittedResult.data?.is_submitted === true
    totalEntries = entryCountResult.count ?? 0
    ORACLE_POSITIONS.forEach((pos, i) => {
      rankingCounts[pos] = rankingResults[i]?.length ?? 0
    })
  } else if (season) {
    const db = getServiceClient()
    const { count } = await db
      .from('challenge_rankings')
      .select('user_id', { count: 'exact', head: true })
      .eq('season_id', season.id)
      .eq('is_submitted', true)
    totalEntries = count ?? 0
  }

  const completedPositions = ORACLE_POSITIONS.filter(
    pos => rankingCounts[pos] >= POSITION_LIST_SIZE[pos],
  )
  const allComplete = completedPositions.length === 4

  /* ─── Signed-in dashboard ─────────────────────────────────────────── */
  if (session) {
    const firstName = displayName?.split(' ')[0] ?? 'there'

    return (
      <div className="px-4 py-6 max-w-md mx-auto flex flex-col gap-4">
        {/* Greeting */}
        <div className="pt-1">
          <h1 className="text-pmp-white font-bold text-2xl">
            Welcome back, {firstName}.
          </h1>
          <p className="text-pmp-gray-600 text-sm mt-0.5">2026 Oracle Challenge</p>
        </div>

        {/* Entry status card */}
        <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-5 py-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-pmp-white font-bold text-base">My Entry</p>
              {isSubmitted ? (
                <p className="text-pmp-red text-xs font-semibold mt-0.5">Officially entered ✓</p>
              ) : allComplete ? (
                <p className="text-yellow-400 text-xs font-semibold mt-0.5">Ready to enter</p>
              ) : (
                <p className="text-pmp-gray-600 text-xs mt-0.5">In progress</p>
              )}
            </div>
            <div className="flex gap-1.5">
              {ORACLE_POSITIONS.map(pos => {
                const done = rankingCounts[pos] >= POSITION_LIST_SIZE[pos]
                return (
                  <div
                    key={pos}
                    className={[
                      'flex flex-col items-center gap-0.5 w-10 py-1.5 rounded-lg',
                      done ? 'bg-pmp-red/10' : 'bg-pmp-gray-800',
                    ].join(' ')}
                  >
                    <span className="text-[10px] font-bold text-pmp-gray-500">{pos}</span>
                    <span className="text-sm">{done ? '✓' : '·'}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {!locked && (
            <div className="flex gap-2">
              <Link
                href="/challenge/rankings"
                className="flex-1 bg-pmp-red text-pmp-white font-bold py-2.5 rounded-xl text-sm text-center hover:opacity-90 transition-opacity"
              >
                {allComplete ? 'Edit Rankings' : 'Continue Building'}
              </Link>
              {!isSubmitted && allComplete && (
                <Link
                  href="/challenge/rankings/review"
                  className="flex-1 bg-pmp-gray-800 text-pmp-white font-semibold py-2.5 rounded-xl text-sm text-center hover:bg-pmp-gray-700 transition-colors"
                >
                  Review & Enter
                </Link>
              )}
            </div>
          )}
          {locked && isSubmitted && (
            <Link
              href="/challenge/rankings"
              className="w-full bg-pmp-gray-800 text-pmp-white font-semibold py-2.5 rounded-xl text-sm text-center hover:bg-pmp-gray-700 transition-colors"
            >
              View My Rankings
            </Link>
          )}
        </div>

        {/* Countdown card */}
        {!locked && (
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-5 py-5 flex items-center justify-between">
            <div>
              <p className="text-pmp-white font-bold text-base">Time Remaining</p>
              <p className="text-pmp-gray-600 text-xs mt-0.5">Rankings lock Sep 9 at kickoff</p>
            </div>
            <div className="text-right">
              <p className="text-pmp-white font-black text-3xl">{daysLeft}</p>
              <p className="text-pmp-gray-600 text-xs">days left</p>
            </div>
          </div>
        )}
        {locked && (
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-5 py-5 text-center">
            <p className="text-pmp-white font-bold text-base">Rankings Locked</p>
            <p className="text-pmp-gray-600 text-xs mt-1">
              {season?.status === 'scored' ? 'Season complete — results available' : 'Locked until the 2026 season ends'}
            </p>
          </div>
        )}

        {/* Community card */}
        <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-5 py-5 flex items-center justify-between">
          <div>
            <p className="text-pmp-white font-bold text-base">Community</p>
            <p className="text-pmp-gray-600 text-xs mt-0.5">
              {totalEntries === 1 ? '1 entry so far' : `${totalEntries.toLocaleString()} entries so far`}
            </p>
          </div>
          <Link
            href="/challenge/leaderboard"
            className="text-pmp-red text-sm font-semibold hover:opacity-80"
          >
            View →
          </Link>
        </div>

        {/* Results teaser */}
        {season?.status === 'scored' && (
          <Link
            href="/challenge/results"
            className="bg-pmp-red text-pmp-white font-bold py-4 rounded-2xl text-sm text-center hover:opacity-90 transition-opacity"
          >
            View My Results →
          </Link>
        )}
      </div>
    )
  }

  /* ─── Anonymous / not signed in ──────────────────────────────────── */
  return (
    <div className="px-4 py-8 max-w-md mx-auto flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-pmp-red text-xs font-bold uppercase tracking-widest">2026 Oracle Challenge</p>
        <h1 className="text-pmp-white text-2xl font-bold leading-snug">
          Can you predict the 2026 fantasy season?
        </h1>
        <p className="text-pmp-gray-500 text-sm">
          Rank the top QBs, RBs, WRs, and TEs. Lock in before Week 1. Get scored in January.
        </p>
      </div>

      {/* Countdown */}
      {!locked && season && (
        <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-5 py-5 flex items-center justify-between">
          <div>
            <p className="text-pmp-white font-bold">Time Remaining</p>
            <p className="text-pmp-gray-600 text-xs mt-0.5">Rankings lock Sep 9</p>
          </div>
          <div className="text-right">
            <p className="text-pmp-white font-black text-3xl">{daysLeft}</p>
            <p className="text-pmp-gray-600 text-xs">days left</p>
          </div>
        </div>
      )}

      {/* Community proof */}
      {totalEntries > 0 && (
        <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-5 py-4 flex items-center gap-3">
          <p className="text-pmp-white font-black text-2xl">{totalEntries.toLocaleString()}</p>
          <p className="text-pmp-gray-500 text-sm">fantasy managers already entered</p>
        </div>
      )}

      {/* CTA */}
      {!locked && (
        <Link
          href="/challenge/rankings"
          className="w-full bg-pmp-red text-pmp-white font-bold py-4 rounded-2xl text-sm text-center hover:opacity-90 transition-opacity"
        >
          Build My Rankings
        </Link>
      )}

      <p className="text-pmp-gray-600 text-xs text-center">
        PPR · Top 10 QB · Top 20 RB · Top 20 WR · Top 10 TE
      </p>
    </div>
  )
}
