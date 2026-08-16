'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface OracleNavProps {
  username: string | null
  variant?: 'bottom' | 'top'
}

const TABS = [
  { key: 'feed',        label: 'Dashboard',   icon: '🏠',  href: '/challenge' },
  { key: 'players',    label: 'Players',     icon: '🔍',  href: '/players' },
  { key: 'leaderboard',label: 'Leaderboard', icon: '🏅',  href: '/challenge/leaderboard' },
  { key: 'results',    label: 'Results',     icon: '📈',  href: '/challenge/results' },
  { key: 'profile',    label: 'Profile',     icon: '👤',  href: null },
] as const

function isTabActive(key: string, pathname: string): boolean {
  if (key === 'feed') {
    return (
      pathname === '/challenge' ||
      (pathname.startsWith('/challenge') &&
        !pathname.startsWith('/challenge/leaderboard') &&
        !pathname.startsWith('/challenge/results'))
    )
  }
  if (key === 'players') return pathname.startsWith('/players')
  if (key === 'leaderboard') return pathname.startsWith('/challenge/leaderboard')
  if (key === 'results') return pathname.startsWith('/challenge/results')
  if (key === 'profile') return pathname.startsWith('/u/')
  return false
}

export function OracleNav({ username, variant = 'bottom' }: OracleNavProps) {
  const pathname = usePathname()

  const getHref = (tab: typeof TABS[number]) =>
    tab.key === 'profile' ? (username ? `/u/${username}` : '/challenge') : tab.href!

  /* ── Desktop top nav ───────────────────────────────────────────────────── */
  if (variant === 'top') {
    return (
      <nav className="hidden md:flex items-center gap-1 ml-auto">
        {TABS.map(tab => {
          const active = isTabActive(tab.key, pathname)
          return (
            <Link
              key={tab.key}
              href={getHref(tab)}
              className={[
                'px-3 py-1.5 rounded text-sm font-medium transition-colors',
                active
                  ? 'text-pmp-white bg-pmp-gray-800'
                  : 'text-pmp-gray-500 hover:text-pmp-gray-300 hover:bg-pmp-gray-900',
              ].join(' ')}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
    )
  }

  /* ── Mobile bottom nav ─────────────────────────────────────────────────── */
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-pmp-black border-t border-pmp-gray-800 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex">
        {TABS.map(tab => {
          const active = isTabActive(tab.key, pathname)
          return (
            <Link
              key={tab.key}
              href={getHref(tab)}
              className={[
                'flex-1 flex flex-col items-center pt-2.5 pb-2 gap-0.5 min-h-[52px]',
                active ? 'text-pmp-red' : 'text-pmp-gray-600 hover:text-pmp-gray-400',
              ].join(' ')}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
