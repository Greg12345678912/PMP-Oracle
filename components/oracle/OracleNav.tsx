'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ProfileGate } from './ProfileGate'

interface OracleNavProps {
  username: string | null
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

export function OracleNav({ username }: OracleNavProps) {
  const pathname = usePathname()
  const [showGate, setShowGate] = useState(false)

  return (
    <>
      {showGate && (
        <ProfileGate
          redirectTo="/challenge"
          onDismiss={() => setShowGate(false)}
        />
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-pmp-black border-t border-pmp-gray-800"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex">
          {TABS.map(tab => {
            const active = isTabActive(tab.key, pathname)

            /* Profile tab — dynamic href based on sign-in state */
            if (tab.key === 'profile') {
              if (username) {
                return (
                  <Link
                    key={tab.key}
                    href={`/u/${username}`}
                    className={[
                      'flex-1 flex flex-col items-center pt-2.5 pb-2 gap-0.5 min-h-[52px]',
                      active ? 'text-pmp-red' : 'text-pmp-gray-600 hover:text-pmp-gray-400',
                    ].join(' ')}
                  >
                    <span className="text-lg leading-none">{tab.icon}</span>
                    <span className="text-[10px] font-medium">{tab.label}</span>
                  </Link>
                )
              }
              return (
                <button
                  key={tab.key}
                  onClick={() => setShowGate(true)}
                  className="flex-1 flex flex-col items-center pt-2.5 pb-2 gap-0.5 min-h-[52px] text-pmp-gray-600 hover:text-pmp-gray-400"
                >
                  <span className="text-lg leading-none">{tab.icon}</span>
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </button>
              )
            }

            return (
              <Link
                key={tab.key}
                href={tab.href!}
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
    </>
  )
}
