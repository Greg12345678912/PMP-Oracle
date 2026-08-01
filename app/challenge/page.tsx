import Link from 'next/link'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { Countdown } from '@/components/oracle/Countdown'

export const dynamic = 'force-dynamic'

export default async function ChallengePage() {
  const season = await getCurrentSeason()

  return (
    <div className="min-h-[100dvh] bg-pmp-black flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="w-full max-w-md flex flex-col items-center gap-8">

        <div className="flex flex-col gap-4">
          <p className="text-pmp-red text-xs font-bold uppercase tracking-[0.3em]">
            🏆 Pretty Much Picks
          </p>
          <h1 className="text-pmp-white text-4xl font-bold leading-tight">
            The Oracle Challenge
          </h1>
          <p className="text-pmp-white text-lg font-semibold leading-snug">
            Can you predict the 2026 fantasy season better than everyone else?
          </p>
          <div className="flex flex-col gap-1.5 text-pmp-gray-500 text-sm text-left">
            <p>📋 Rank the Top 10 QBs, Top 20 RBs, Top 20 WRs, Top 10 TEs</p>
            <p>🔒 Lock in before Week 1 kickoff</p>
            <p>📊 Get scored on accuracy in January</p>
            <p>🏅 Build your fantasy reputation</p>
          </div>
        </div>

        {season && !isLocked(season) ? (
          <div className="flex flex-col items-center gap-2">
            <p className="text-pmp-gray-600 text-xs uppercase tracking-widest">
              Rankings lock in
            </p>
            <Countdown lockDate={season.lock_at} />
          </div>
        ) : (
          <p className="text-pmp-gray-600 text-sm">
            {season?.status === 'scored' ? 'Season complete — results available' : 'Rankings are locked for the 2026 season'}
          </p>
        )}

        <div className="flex flex-col gap-3 w-full">
          <Link
            href="/challenge/rankings"
            className="w-full bg-pmp-red text-pmp-white font-bold py-3.5 rounded-xl text-sm hover:opacity-90 transition-opacity"
          >
            {season && isLocked(season) ? 'View My Rankings' : 'Build My Rankings'}
          </Link>
          <Link
            href="/challenge/leaderboard"
            className="w-full bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-gray-400 font-medium py-3 rounded-xl text-sm text-center hover:border-pmp-gray-600 hover:text-pmp-white transition-colors block"
          >
            View Leaderboard
          </Link>
        </div>

        <p className="text-pmp-gray-600 text-xs">
          2026 · PPR scoring · Top 10 QB / Top 20 RB / Top 20 WR / Top 10 TE
        </p>
      </div>
    </div>
  )
}
