import Link from 'next/link'
import Image from 'next/image'
import { getSession } from '@/lib/auth/server'
import { getServiceClient } from '@/lib/league/db'
import { OracleNav } from '@/components/oracle/OracleNav'

export default async function ChallengeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
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

  return (
    <div className="flex flex-col min-h-[100dvh] bg-pmp-black">
      {/* Persistent top bar — logo goes home, exits Oracle */}
      <header className="sticky top-0 z-30 bg-pmp-black border-b border-pmp-gray-800 px-4 h-12 flex items-center shrink-0">
        <Link href="/" className="flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity">
          <Image src="/logo.png" alt="Pretty Much Picks" width={22} height={22} className="rounded" />
          <span className="text-pmp-white text-sm font-bold tracking-tight">Pretty Much Picks</span>
        </Link>
      </header>

      {/* Page content — padded bottom so content clears the nav */}
      <div className="flex-1 pb-[calc(56px+env(safe-area-inset-bottom,0px))]">
        {children}
      </div>

      <OracleNav username={username} />
    </div>
  )
}
