import Link from 'next/link'
import Image from 'next/image'
import { getSession } from '@/lib/auth/server'
import { getServiceClient } from '@/lib/league/db'
import { OracleNav } from '@/components/oracle/OracleNav'
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { getPreviewState, mockSeason } from '@/lib/oracle/dev-preview'

function daysUntilLock(lockAt: string): number {
  return Math.max(0, Math.floor((new Date(lockAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
}

export default async function ChallengeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const previewState = await getPreviewState()
  const [session, rawSeason] = await Promise.all([getSession(), getCurrentSeason()])
  const season = previewState ? mockSeason(previewState) : rawSeason
  let username: string | null = null

  if (session) {
    const db = getServiceClient()
    const { data } = await db
      .from('user_profiles')
      .select('username')
      .eq('user_id', session.user.id)
      .maybeSingle()
    username = (data?.username as string | null) ?? null
  }

  const locked = season ? isLocked(season) : false
  const daysLeft = season && !locked ? daysUntilLock(season.lock_at) : 0

  return (
    <div className="flex flex-col min-h-[100dvh] bg-pmp-black">
      {/* Persistent top bar — logo goes home, exits Oracle */}
      <header className="sticky top-0 z-30 bg-pmp-black border-b border-pmp-gray-800 shrink-0">
        <div className="px-4 h-12 flex items-center">
        <Link href="/" className="flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity">
          <Image src="/logo.png" alt="Pretty Much Picks" width={22} height={22} className="rounded" />
          <span className="text-pmp-white text-sm font-bold tracking-tight">Pretty Much Picks</span>
        </Link>
        </div>
        {/* Status strip */}
        <div className="px-4 py-1.5 bg-pmp-gray-900 border-t border-pmp-gray-800 flex items-center gap-2">
          <span className={['w-1.5 h-1.5 rounded-full shrink-0', locked ? 'bg-pmp-gray-600' : 'bg-green-500'].join(' ')} />
          <p className="text-pmp-gray-500 text-[11px]">
            {locked
              ? '2026 Oracle Challenge · Locked'
              : daysLeft === 0
                ? '2026 Oracle Challenge · Open · Closes today'
                : `2026 Oracle Challenge · Open · ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining`}
          </p>
        </div>
      </header>

      {/* Page content — padded bottom so content clears the nav */}
      <div className="flex-1 pb-[calc(56px+env(safe-area-inset-bottom,0px))]">
        {children}
      </div>

      <OracleNav username={username} />
    </div>
  )
}
