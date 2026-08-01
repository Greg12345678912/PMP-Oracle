import { getServiceClient } from '@/lib/league/db'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const season = await getCurrentSeason()
  const db = getServiceClient()

  // Count distinct submitted users — challenge_rankings has one row per (user, season, position)
  // so a head: true count would be inflated by up to 4x. Fetch user_ids and deduplicate.
  const { data: submittedRows } = await db
    .from('challenge_rankings')
    .select('user_id')
    .eq('is_submitted', true)
    .eq('season_id', season?.id ?? '')

  const totalEntries = new Set((submittedRows ?? []).map(r => r.user_id as string)).size

  const isScored = season?.status === 'scored'
  const pageLabel = isScored
    ? 'Leaderboard'
    : (season && isLocked(season))
      ? 'Entries'
      : 'Participants'

  if (isScored) {
    // Post-season: show accuracy leaderboard
    const { data: scores } = await db
      .from('accuracy_scores')
      .select('user_id, overall_score, global_rank, computed_at')
      .eq('season_id', season!.id)
      .order('global_rank', { ascending: true })
      .limit(50)

    const userIds = (scores ?? []).map(s => s.user_id as string)
    const { data: profiles } = userIds.length > 0
      ? await db.from('user_profiles').select('user_id, display_name, username, avatar_url').in('user_id', userIds)
      : { data: [] }

    const profileMap = new Map((profiles ?? []).map(p => [p.user_id as string, p]))

    return (
      <div className="min-h-[100dvh] bg-pmp-black flex flex-col">
        <div className="px-4 py-6 max-w-md mx-auto w-full flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-pmp-white font-bold text-xl">🏆 2026 Oracle Challenge</h1>
            <p className="text-pmp-gray-500 text-sm">{(totalEntries ?? 0).toLocaleString()} entries · Final standings</p>
          </div>

          <div className="flex flex-col gap-2">
            {(scores ?? []).map((score, i) => {
              const profile = profileMap.get(score.user_id as string)
              const rank = (score.global_rank as number) ?? i + 1
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
                  <span className="text-pmp-white font-bold text-sm shrink-0">
                    {typeof score.overall_score === 'number' ? (score.overall_score as number).toFixed(1) : '—'}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // Pre-season / post-lock: show entry count + recent entrants
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

  // Deduplicate to one entry per user (keep most recent)
  const seen = new Set<string>()
  const uniqueEntries = (recentEntries ?? []).filter(e => {
    if (seen.has(e.user_id as string)) return false
    seen.add(e.user_id as string)
    return true
  })

  const entryCount = totalEntries ?? 0

  return (
    <div className="min-h-[100dvh] bg-pmp-black flex flex-col">
      <div className="px-4 py-6 max-w-md mx-auto w-full flex flex-col gap-6">
        {/* Hero: entry count */}
        {entryCount === 0 ? (
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-6 py-10 flex flex-col items-center gap-2 text-center">
            <p className="text-pmp-red text-xs font-bold uppercase tracking-widest">2026 Oracle Challenge</p>
            <p className="text-pmp-white font-bold text-xl">No one has entered yet.</p>
            <p className="text-pmp-gray-500 text-sm">Be Entry #1.</p>
          </div>
        ) : (
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl px-6 py-8 flex flex-col items-center gap-2 text-center">
            <p className="text-pmp-red text-xs font-bold uppercase tracking-widest">2026 Oracle Challenge</p>
            <p className="text-pmp-white text-5xl font-black">{entryCount.toLocaleString()}</p>
            <p className="text-pmp-gray-500 text-sm">
              {pageLabel === 'Participants'
                ? (entryCount === 1 ? 'participant so far' : 'participants so far')
                : (entryCount === 1 ? 'entry so far' : 'entries so far')}
            </p>
            <p className="text-pmp-gray-600 text-xs mt-2">
              Accuracy leaderboard unlocks after the 2026 season
            </p>
          </div>
        )}

        {/* Recent entrants */}
        {uniqueEntries.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest">Recently Entered</h2>
            <div className="flex flex-col gap-2">
              {uniqueEntries.map((entry) => {
                const profile = recentProfileMap.get(entry.user_id as string)
                const timeAgo = entry.updated_at
                  ? formatDistanceToNow(new Date(entry.updated_at as string), { addSuffix: true })
                  : 'recently'
                return (
                  <div
                    key={entry.user_id as string}
                    className="flex items-center gap-3 bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-4 py-3"
                  >
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
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* CTA if not yet entered */}
        {!season || season.status === 'open' ? (
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
