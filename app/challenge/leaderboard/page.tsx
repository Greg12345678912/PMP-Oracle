import { getServiceClient } from '@/lib/league/db'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { getSession } from '@/lib/auth/server'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

export const dynamic = 'force-dynamic'

function RankMovement({ change }: { change: number | null }) {
  if (change == null || change === 0) return null
  const up = change > 0
  return (
    <span className={['text-xs font-semibold shrink-0', up ? 'text-green-400' : 'text-pmp-red'].join(' ')}>
      {up ? `▲${change}` : `▼${Math.abs(change)}`}
    </span>
  )
}

export default async function LeaderboardPage() {
  const [session, season] = await Promise.all([getSession(), getCurrentSeason()])
  const db = getServiceClient()

  // Count distinct submitted users
  const { data: submittedRows } = await db
    .from('challenge_rankings')
    .select('user_id')
    .eq('is_submitted', true)
    .eq('season_id', season?.id ?? '')

  const totalEntries = new Set((submittedRows ?? []).map(r => r.user_id as string)).size

  // Check if the current user has entered
  let userIsEntered = false
  if (session && season) {
    const { data: userEntry } = await db
      .from('challenge_rankings')
      .select('is_submitted')
      .eq('user_id', session.user.id)
      .eq('season_id', season.id)
      .eq('is_submitted', true)
      .limit(1)
      .maybeSingle()
    userIsEntered = userEntry?.is_submitted === true
  }

  const isScored = season?.status === 'scored'
  const locked = season ? isLocked(season) : false

  // Check if weekly scoring has started
  const { data: weekCheck } = season
    ? await db
        .from('accuracy_scores')
        .select('current_week')
        .eq('season_id', season.id)
        .gt('current_week', 0)
        .limit(1)
    : { data: [] }

  const hasWeeklyScores = (weekCheck ?? []).length > 0
  const showRankings = isScored || hasWeeklyScores

  if (showRankings) {
    const { data: scores } = await db
      .from('accuracy_scores')
      .select('user_id, overall_score, global_rank, rank_change, current_week, computed_at')
      .eq('season_id', season!.id)
      .order('global_rank', { ascending: true })
      .limit(50)

    const currentWeek = (scores ?? []).reduce(
      (max, s) => Math.max(max, (s.current_week as number) ?? 0),
      0,
    )

    const userIds = (scores ?? []).map(s => s.user_id as string)
    const { data: profiles } = userIds.length > 0
      ? await db.from('user_profiles').select('user_id, display_name, username, avatar_url').in('user_id', userIds)
      : { data: [] }

    const profileMap = new Map((profiles ?? []).map(p => [p.user_id as string, p]))

    return (
      <div className="min-h-[100dvh] bg-pmp-black flex flex-col">
        <div className="px-4 py-6 max-w-md mx-auto w-full flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-pmp-white font-bold text-xl">
                {isScored ? '🏆 2026 Oracle Challenge' : '📊 Weekly Standings'}
              </h1>
              <Link href="/challenge/scoring" className="text-pmp-gray-600 text-xs hover:text-pmp-gray-400 transition-colors shrink-0">
                Scoring rules →
              </Link>
            </div>
            <p className="text-pmp-gray-500 text-sm">
              {isScored
                ? `${totalEntries.toLocaleString()} entries · Final standings`
                : `${totalEntries.toLocaleString()} entries · Week ${currentWeek} standings`}
            </p>
            {!isScored && (
              <p className="text-pmp-gray-700 text-xs mt-0.5">
                Scores are recalculated every Tuesday
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {(scores ?? []).map((score, i) => {
              const profile = profileMap.get(score.user_id as string)
              const rank = (score.global_rank as number) ?? i + 1
              const rankChange = score.rank_change as number | null
              return (
                <Link
                  key={score.user_id as string}
                  href={profile?.username ? `/u/${profile.username}` : '#'}
                  className="flex items-center gap-3 bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-4 py-3 hover:border-pmp-gray-600 transition-colors"
                >
                  <span className={[
                    'text-sm font-black w-7 text-right shrink-0',
                    rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-pmp-gray-400' : rank === 3 ? 'text-amber-600' : 'text-pmp-gray-600',
                  ].join(' ')}>
                    {rank}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-pmp-gray-800 flex items-center justify-center shrink-0 overflow-hidden">
                    {profile?.avatar_url
                      ? <img src={profile.avatar_url as string} alt="" className="w-full h-full object-cover" />
                      : <span className="text-pmp-white text-xs font-bold">{((profile?.display_name as string) ?? 'U')[0]}</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-pmp-white text-sm font-semibold truncate">{(profile?.display_name as string) ?? 'Anonymous'}</p>
                    {profile?.username && <p className="text-pmp-gray-600 text-xs">@{profile.username as string}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <RankMovement change={rankChange} />
                    <span className="text-pmp-white font-bold text-sm shrink-0">
                      {typeof score.overall_score === 'number' ? (score.overall_score as number).toFixed(1) : '—'}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>

          {userIsEntered ? (
            <Link
              href="/challenge/results"
              className="w-full bg-pmp-red text-pmp-white font-bold py-3.5 rounded-xl text-sm text-center hover:opacity-90 transition-opacity"
            >
              See My Results →
            </Link>
          ) : session ? null : (
            <Link
              href="/challenge/rankings"
              className="w-full bg-pmp-red text-pmp-white font-bold py-3.5 rounded-xl text-sm text-center hover:opacity-90 transition-opacity"
            >
              Build My Rankings →
            </Link>
          )}
        </div>
      </div>
    )
  }

  // Pre-scoring: show entry count + recent entrants
  const { data: recentEntries } = await db
    .from('challenge_rankings')
    .select('user_id, updated_at')
    .eq('is_submitted', true)
    .eq('season_id', season?.id ?? '')
    .order('updated_at', { ascending: false })
    .limit(20)

  const recentUserIds = [...new Set((recentEntries ?? []).map(e => e.user_id as string))]
  const { data: recentProfiles } = recentUserIds.length > 0
    ? await db.from('user_profiles').select('user_id, display_name, username, avatar_url').in('user_id', recentUserIds)
    : { data: [] }

  const recentProfileMap = new Map((recentProfiles ?? []).map(p => [p.user_id as string, p]))

  const seen = new Set<string>()
  const uniqueEntries = (recentEntries ?? []).filter(e => {
    if (seen.has(e.user_id as string)) return false
    seen.add(e.user_id as string)
    return true
  })

  return (
    <div className="min-h-[100dvh] bg-pmp-black flex flex-col">
      <div className="px-4 py-6 max-w-md mx-auto w-full flex flex-col gap-6">
        {totalEntries === 0 ? (
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-6 py-10 flex flex-col items-center gap-2 text-center">
            <p className="text-pmp-red text-xs font-bold uppercase tracking-widest">2026 Oracle Challenge</p>
            <p className="text-pmp-white font-bold text-xl">No one has entered yet.</p>
            <p className="text-pmp-gray-500 text-sm">Be Entry #1.</p>
          </div>
        ) : (
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-6 py-8 flex flex-col items-center gap-2 text-center">
            <p className="text-pmp-red text-xs font-bold uppercase tracking-widest">2026 Oracle Challenge</p>
            <p className="text-pmp-white text-5xl font-black">{totalEntries.toLocaleString()}</p>
            <p className="text-pmp-gray-500 text-sm">
              {totalEntries === 1 ? 'participant so far' : 'participants so far'}
            </p>
            <div className="mt-3 flex flex-col gap-1 text-center">
              <p className="text-pmp-white text-sm font-semibold">
                🏆 Official standings begin after Week 1
              </p>
              <p className="text-pmp-gray-600 text-xs">
                Updated every Tuesday throughout the NFL season.
              </p>
            </div>
          </div>
        )}

        {uniqueEntries.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">Recent Entrants</h2>
            <div className="flex flex-col gap-2">
              {uniqueEntries.map((entry) => {
                const profile = recentProfileMap.get(entry.user_id as string)
                const timeAgo = entry.updated_at
                  ? formatDistanceToNow(new Date(entry.updated_at as string), { addSuffix: true })
                  : 'recently'
                const username = profile?.username as string | undefined
                const inner = (
                  <>
                    <div className="w-8 h-8 rounded-full bg-pmp-gray-800 flex items-center justify-center shrink-0 overflow-hidden">
                      {profile?.avatar_url
                        ? <img src={profile.avatar_url as string} alt="" className="w-full h-full object-cover" />
                        : <span className="text-pmp-white text-xs font-bold">{((profile?.display_name as string) ?? 'U')[0]}</span>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-pmp-white text-sm font-semibold truncate">{(profile?.display_name as string) ?? 'Anonymous'}</p>
                    </div>
                    <span className="text-pmp-gray-600 text-xs shrink-0">{timeAgo}</span>
                  </>
                )
                return username ? (
                  <Link
                    key={entry.user_id as string}
                    href={`/u/${username}`}
                    className="flex items-center gap-3 bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-4 py-3 hover:border-pmp-gray-600 transition-colors"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div
                    key={entry.user_id as string}
                    className="flex items-center gap-3 bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-4 py-3"
                  >
                    {inner}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Dynamic CTA — "See My Results" only appears once weekly scoring has started */}
        {userIsEntered ? (
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-4 py-4 flex items-center gap-3">
            <span className="text-base shrink-0">✅</span>
            <div>
              <p className="text-pmp-white text-sm font-semibold">You&apos;re entered</p>
              <p className="text-pmp-gray-500 text-xs">Scores arrive after Week 1 games complete</p>
            </div>
          </div>
        ) : (!season || season.status === 'open') ? (
          <Link
            href="/challenge/rankings"
            className="w-full bg-pmp-red text-pmp-white font-bold py-3.5 rounded-xl text-sm text-center hover:opacity-90 transition-opacity"
          >
            Build My Rankings →
          </Link>
        ) : null}
      </div>
    </div>
  )
}
