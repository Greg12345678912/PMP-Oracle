import Link from 'next/link'
import { getSession } from '@/lib/auth/server'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { getServiceClient } from '@/lib/league/db'
import { getRankings } from '@/lib/oracle/rankings'
import { ORACLE_POSITIONS, POSITION_LIST_SIZE } from '@/lib/oracle/constants'
import type { OraclePosition } from '@/lib/oracle/constants'
import { OracleSplashCTA } from '@/components/oracle/OracleSplashCTA'
import { SignOutButton } from '@/components/oracle/SignOutButton'
import { Countdown } from '@/components/oracle/Countdown'
import { getPreviewState, mockSeason, mockAccuracyScore } from '@/lib/oracle/dev-preview'

export const dynamic = 'force-dynamic'

function formatLockLabel(lockAt: string) {
  const d = new Date(lockAt)
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' })
  return `${date} · ${time}`
}

export default async function ChallengePage() {
  const previewState = await getPreviewState()
  const [session, rawSeason] = await Promise.all([getSession(), getCurrentSeason()])
  const season = previewState ? mockSeason(previewState) : rawSeason
  const locked = season ? isLocked(season) : true
  const lockLabel = season ? formatLockLabel(season.lock_at) : ''

  /* ─── Signed-in data ─────────────────────────────────────────────── */
  let displayName: string | null = null
  let rankingCounts: Record<OraclePosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 }
  let isSubmitted = false
  let totalEntries = 0
  let entryNumber: number | null = null
  let hasWeeklyScores = false
  let currentWeek = 0

  if (previewState && previewState !== 'locked') {
    // Inject mock data for scoring/scored preview states
    displayName = 'Greg Spunt'
    hasWeeklyScores = true
    currentWeek = mockAccuracyScore(previewState)?.current_week ?? 0
    isSubmitted = true
    totalEntries = 247
    entryNumber = 42
    rankingCounts = { QB: 10, RB: 10, WR: 10, TE: 10 }
  } else if (previewState === 'locked') {
    displayName = 'Greg Spunt'
    isSubmitted = true
    totalEntries = 247
    entryNumber = 42
    rankingCounts = { QB: 10, RB: 10, WR: 10, TE: 10 }
  } else if (session && season) {
    const db = getServiceClient()
    const [profileResult, submittedResult, entryCountResult, entryNumberResult, weeklyScoresResult, ...rankingResults] =
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
        db
          .from('oracle_entries')
          .select('entry_number')
          .eq('user_id', session.user.id)
          .eq('season_id', season.id)
          .maybeSingle(),
        db
          .from('accuracy_scores')
          .select('current_week')
          .eq('season_id', season.id)
          .gt('current_week', 0)
          .limit(1),
        ...ORACLE_POSITIONS.map(pos => getRankings(session.user.id, season.id, pos)),
      ])

    displayName = (profileResult.data?.display_name as string | null) ?? null
    isSubmitted = submittedResult.data?.is_submitted === true
    totalEntries = new Set((entryCountResult.data ?? []).map((r: { user_id: string }) => r.user_id)).size + 1
    entryNumber = (entryNumberResult.data?.entry_number as number | null) ?? null
    hasWeeklyScores = ((weeklyScoresResult.data ?? []) as unknown[]).length > 0
    currentWeek = (weeklyScoresResult.data as Array<{ current_week: number }> | null)?.[0]?.current_week ?? 0
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
    totalEntries = new Set((submittedRows ?? []).map((r: { user_id: string }) => r.user_id)).size + 1
  }

  const completedPositions = ORACLE_POSITIONS.filter(
    pos => rankingCounts[pos] >= POSITION_LIST_SIZE[pos],
  )
  const allComplete = completedPositions.length === 4

  /* ─── Signed-in dashboard ─────────────────────────────────────────── */
  if (session || previewState) {
    const firstName = displayName?.split(' ')[0] ?? 'there'

    return (
      <div className="px-4 py-6 max-w-md mx-auto flex flex-col gap-4">
        {/* Greeting */}
        <div className="pt-1">
          <h1 className="text-pmp-white font-bold text-2xl">
            Welcome back, {firstName}.
          </h1>
          {isSubmitted ? (
            <p className="text-pmp-red text-sm font-semibold mt-0.5">Officially entered</p>
          ) : allComplete ? (
            <p className="text-pmp-gray-400 text-sm mt-0.5">All rankings saved — ready to submit</p>
          ) : completedPositions.length > 0 ? (
            <p className="text-pmp-gray-400 text-sm mt-0.5">
              {ORACLE_POSITIONS.map(pos => (
                <span key={pos} className={rankingCounts[pos] >= POSITION_LIST_SIZE[pos] ? 'text-pmp-white' : 'text-pmp-gray-600'}>
                  {rankingCounts[pos] >= POSITION_LIST_SIZE[pos] ? '✓' : '·'} {pos}{' '}
                </span>
              ))}
            </p>
          ) : (
            <p className="text-pmp-gray-600 text-sm mt-0.5">Start ranking to enter</p>
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
              {isSubmitted && entryNumber !== null && (
                <span className="text-pmp-red font-black text-base shrink-0">
                  #{entryNumber.toLocaleString()}
                </span>
              )}
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
          {locked && isSubmitted && hasWeeklyScores && (
            <Link href="/challenge/results" className="w-full bg-pmp-red text-pmp-white font-bold py-3 rounded-xl text-sm text-center hover:opacity-90 transition-opacity">
              View My Results →
            </Link>
          )}
          {locked && isSubmitted && !hasWeeklyScores && (
            <Link href="/challenge/rankings" className="w-full bg-pmp-gray-800 text-pmp-white font-semibold py-3 rounded-xl text-sm text-center hover:bg-pmp-gray-700 transition-colors">
              View My Rankings
            </Link>
          )}
          <Link href="/challenge/scoring" className="text-pmp-gray-600 text-xs text-center hover:text-pmp-gray-500 transition-colors">
            How scoring works →
          </Link>
        </div>

        {/* Countdown card */}
        {!locked && season && (
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-5 py-5 flex flex-col gap-3">
            <div>
              <p className="text-pmp-white font-bold text-base">Time Remaining</p>
              <p className="text-pmp-gray-600 text-xs mt-0.5">Rankings lock {lockLabel}</p>
            </div>
            <Countdown lockDate={season.lock_at} />
          </div>
        )}
        {locked && (
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-5 py-5 text-center">
            <p className="text-pmp-white font-bold text-base">
              {season?.status === 'scored'
                ? 'Season Complete'
                : isSubmitted && hasWeeklyScores
                  ? `Week ${currentWeek} Results Live`
                  : isSubmitted
                    ? "You're Locked In"
                    : 'Entry Closed'}
            </p>
            <p className="text-pmp-gray-600 text-xs mt-1">
              {season?.status === 'scored'
                ? 'Results are available'
                : isSubmitted && hasWeeklyScores
                  ? `Week ${currentWeek} results are live. See how your rankings performed.`
                  : isSubmitted
                    ? 'Your picks are locked in. First score update arrives after Week 1.'
                    : 'The entry window has closed for the 2026 season.'}
            </p>
          </div>
        )}

        {/* Community card */}
        <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-5 py-5 flex items-center justify-between">
          <div>
            <p className="text-pmp-white font-bold text-base">Community</p>
            <p className="text-pmp-gray-600 text-xs mt-0.5">
              {season?.status === 'scored'
                ? `${totalEntries.toLocaleString()} total entries`
                : totalEntries === 1 ? '1 entry so far' : `${totalEntries.toLocaleString()} entries so far`}
            </p>
          </div>
          <Link
            href="/challenge/leaderboard"
            className="text-pmp-red text-sm font-semibold hover:opacity-80"
          >
            View →
          </Link>
        </div>

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
            { n: '2', text: 'Rankings lock September 9 at 5:00 PM ET.' },
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
          PPR · Top 10 QB · Top 10 RB · Top 10 WR · Top 10 TE<br />
          Only one entry per season
        </p>
      </div>
    </div>
  )
}
