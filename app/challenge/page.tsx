import Link from 'next/link'
import { getSession } from '@/lib/auth/server'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { getServiceClient } from '@/lib/league/db'
import { getRankings } from '@/lib/oracle/rankings'
import { getPredictions } from '@/lib/oracle/predictions'
import { ORACLE_POSITIONS, ORACLE_LOCK_DATE, POSITION_LIST_SIZE } from '@/lib/oracle/constants'
import type { OraclePosition } from '@/lib/oracle/constants'
import { OracleSplashCTA } from '@/components/oracle/OracleSplashCTA'
import { SignOutButton } from '@/components/oracle/SignOutButton'

export const dynamic = 'force-dynamic'

function daysUntil(date: Date): number {
  return Math.max(0, Math.floor((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
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
  let predictionCount = 0

  if (session && season) {
    const db = getServiceClient()
    const [profileResult, submittedResult, entryCountResult, predictionRows, ...rankingResults] =
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
          .select('user_id')
          .eq('season_id', season.id)
          .eq('is_submitted', true),
        getPredictions(db, session.user.id, season.id),
        ...ORACLE_POSITIONS.map(pos => getRankings(session.user.id, season.id, pos)),
      ])

    displayName = (profileResult.data?.display_name as string | null) ?? null
    isSubmitted = submittedResult.data?.is_submitted === true
    totalEntries = new Set((entryCountResult.data ?? []).map((r: { user_id: string }) => r.user_id)).size
    predictionCount = predictionRows.length
    ORACLE_POSITIONS.forEach((pos, i) => {
      rankingCounts[pos] = rankingResults[i]?.length ?? 0
    })
  } else if (season) {
    const db = getServiceClient()
    const { data: submittedRows } = await db
      .from('challenge_rankings')
      .select('user_id')
      .eq('season_id', season.id)
      .eq('is_submitted', true)
    totalEntries = new Set((submittedRows ?? []).map((r: { user_id: string }) => r.user_id)).size
  }

  const completedPositions = ORACLE_POSITIONS.filter(
    pos => rankingCounts[pos] >= POSITION_LIST_SIZE[pos],
  )
  const allComplete = completedPositions.length === 4
  const totalRanked = ORACLE_POSITIONS.reduce((sum, pos) => sum + rankingCounts[pos], 0)
  const totalPossible = Object.values(POSITION_LIST_SIZE).reduce((a, b) => a + b, 0) // 60

  // Step-based progress: rankings=33%, predictions=33%, submitted=34%
  const entryPct = isSubmitted
    ? 100
    : Math.round((completedPositions.length / 4) * 33) +
      Math.round((Math.min(predictionCount, 8) / 8) * 33)

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
          {isSubmitted ? (
            <p className="text-pmp-red text-sm font-semibold mt-0.5">Officially entered · 100% complete</p>
          ) : entryPct > 0 ? (
            <p className="text-pmp-gray-400 text-sm mt-0.5">{entryPct}% complete</p>
          ) : (
            <p className="text-pmp-gray-600 text-sm mt-0.5">0% complete</p>
          )}
        </div>

        {/* Entry checklist */}
        <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-5 py-5 flex flex-col gap-4">
          <p className="text-pmp-white font-bold text-base">Your Entry</p>

          <div className="flex flex-col gap-2">
            {/* Rankings */}
            <Link href="/challenge/rankings" className="flex items-center gap-3 py-2 group">
              <span className="text-lg w-6 text-center shrink-0">
                {allComplete ? '✅' : completedPositions.length > 0 ? '🔵' : '⬜'}
              </span>
              <div className="flex-1">
                <p className={['text-sm font-semibold', allComplete ? 'text-pmp-white' : 'text-pmp-gray-400'].join(' ')}>
                  Rankings
                </p>
                <p className="text-pmp-gray-600 text-xs">
                  {allComplete
                    ? 'QB · RB · WR · TE ✓'
                    : completedPositions.length > 0
                      ? `${completedPositions.join(' · ')} done · ${ORACLE_POSITIONS.filter(p => !completedPositions.includes(p)).join(' · ')} remaining`
                      : 'QB · RB · WR · TE'}
                </p>
              </div>
              {!locked && <span className="text-pmp-red text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">Edit →</span>}
            </Link>

            <div className="h-px bg-pmp-gray-800" />

            {/* Predictions */}
            <Link href="/challenge/predictions" className="flex items-center gap-3 py-2 group">
              <span className="text-lg w-6 text-center shrink-0">
                {predictionCount >= 8 ? '✅' : predictionCount > 0 ? '🔵' : '⬜'}
              </span>
              <div className="flex-1">
                <p className={['text-sm font-semibold', predictionCount > 0 ? 'text-pmp-white' : 'text-pmp-gray-400'].join(' ')}>
                  Predictions
                </p>
                <p className="text-pmp-gray-600 text-xs">
                  {predictionCount > 0 ? `${predictionCount} / 8 answered` : '8 questions · season props'}
                </p>
              </div>
              {!locked && <span className="text-pmp-red text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                {predictionCount > 0 ? 'Edit →' : 'Add →'}
              </span>}
            </Link>

            <div className="h-px bg-pmp-gray-800" />

            {/* Entered */}
            <div className="flex items-center gap-3 py-2">
              <span className="text-lg w-6 text-center shrink-0">
                {isSubmitted ? '✅' : '⬜'}
              </span>
              <div className="flex-1">
                <p className={['text-sm font-semibold', isSubmitted ? 'text-pmp-white' : 'text-pmp-gray-400'].join(' ')}>
                  Entered
                </p>
                <p className="text-pmp-gray-600 text-xs">
                  {isSubmitted ? 'Officially in the 2026 Oracle Challenge' : 'Submit to officially enter'}
                </p>
              </div>
            </div>
          </div>

          {/* CTA */}
          {!locked && (
            <Link
              href={isSubmitted ? '/challenge/rankings' : allComplete ? '/challenge/rankings/review' : '/challenge/rankings'}
              className="w-full bg-pmp-red text-pmp-white font-bold py-3 rounded-xl text-sm text-center hover:opacity-90 transition-opacity"
            >
              {isSubmitted ? 'Edit Rankings' : allComplete ? 'Review & Enter' : 'Continue Rankings'}
            </Link>
          )}
          {locked && isSubmitted && (
            <Link href="/challenge/rankings" className="w-full bg-pmp-gray-800 text-pmp-white font-semibold py-3 rounded-xl text-sm text-center hover:bg-pmp-gray-700 transition-colors">
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

        {/* Sign out */}
        <div className="flex justify-center pt-2 pb-4">
          <SignOutButton />
        </div>
      </div>
    )
  }

  /* ─── Anonymous / not signed in — Oracle splash ──────────────────── */
  return (
    <div className="px-6 py-10 max-w-sm mx-auto flex flex-col gap-8">
      {/* Hero */}
      <div className="flex flex-col gap-6 pt-4">
        <div className="flex flex-col gap-3">
          <p className="text-pmp-red text-xs font-bold uppercase tracking-[0.3em]">2026 Oracle Challenge</p>
          <h1 className="text-pmp-white font-black text-4xl leading-[1.1]">
            Your opinions become your reputation.
          </h1>
          <p className="text-pmp-gray-500 text-base leading-snug">
            Every fantasy manager has opinions. Oracle proves who was right.
          </p>
        </div>

        {/* How it works */}
        <div className="flex flex-col gap-3">
          {[
            { n: '1', text: 'Rank every player before Week 1.' },
            { n: '2', text: 'Your predictions lock September 9.' },
            { n: '3', text: 'We score every pick after the season ends.' },
            { n: '4', text: 'Finish #1 at the end of the season. Win $500. Free entry.' },
          ].map(({ n, text }) => (
            <div key={n} className="flex items-start gap-3">
              <span className="text-pmp-red font-black text-sm w-4 shrink-0 mt-px">{n}</span>
              <p className="text-pmp-gray-400 text-sm leading-snug">{text}</p>
            </div>
          ))}
        </div>

        {/* Social proof */}
        {totalEntries > 0 && (
          <div className="flex items-baseline gap-2">
            <p className="text-pmp-white font-black text-2xl">{totalEntries.toLocaleString()}</p>
            <p className="text-pmp-gray-500 text-sm">fantasy managers already entered</p>
          </div>
        )}
      </div>

      {/* Auth */}
      <div className="flex flex-col gap-3">
        {!locked ? (
          <OracleSplashCTA />
        ) : (
          <p className="text-pmp-gray-600 text-sm text-center">Oracle Challenge is locked for the 2026 season.</p>
        )}
        <p className="text-pmp-gray-700 text-xs text-center pb-6">
          PPR · Top 10 QB · Top 20 RB · Top 20 WR · Top 10 TE<br />
          Only one entry per season
        </p>
      </div>
    </div>
  )
}
