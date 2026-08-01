'use client'
import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/auth/client'
import { RankingList } from '@/components/oracle/RankingList'
import { SignInButton } from '@/components/oracle/SignInButton'
import type { RankingRow } from '@/lib/oracle/rankings'
import type { Player } from '@/lib/data/types'
import type { OraclePosition } from '@/lib/oracle/constants'
import { ORACLE_POSITIONS, POSITION_LIST_SIZE } from '@/lib/oracle/constants'

/** localStorage draft key matching RankingList's convention */
function draftKey(pos: OraclePosition) {
  return `oracle_rankings_draft_${pos}`
}

interface RankingsClientProps {
  initialRankings: Partial<Record<OraclePosition, RankingRow[]>>
  players: Record<OraclePosition, Player[]>
  locked: boolean
  isSignedIn: boolean
}

export function RankingsClient({
  initialRankings,
  players,
  locked,
  isSignedIn,
}: RankingsClientProps) {
  const [activePosition, setActivePosition] = useState<OraclePosition>('QB')

  const [savedPositions, setSavedPositions] = useState<Set<OraclePosition>>(
    () => new Set(ORACLE_POSITIONS.filter(p => (initialRankings[p]?.length ?? 0) > 0))
  )
  const [nudge, setNudge] = useState<string | null>(null)

  /**
   * On sign-in return: if `?synced=1` is NOT in the URL, upload any
   * localStorage drafts to the DB then redirect to strip the query param.
   * This runs once when isSignedIn becomes true client-side.
   */
  useEffect(() => {
    if (!isSignedIn || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('synced') === '1') return

    // Upload any drafts that exist in localStorage
    void (async () => {
      for (const pos of ORACLE_POSITIONS) {
        try {
          const raw = localStorage.getItem(draftKey(pos))
          if (!raw) continue
          const rows: RankingRow[] = JSON.parse(raw)
          if (!rows.length) continue
          await fetch('/api/oracle/rankings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ position: pos, rankings: rows }),
          })
          localStorage.removeItem(draftKey(pos))
        } catch {
          // best-effort
        }
      }
      // Mark as synced so we don't repeat on re-render
      const url = new URL(window.location.href)
      url.searchParams.set('synced', '1')
      window.history.replaceState(null, '', url.toString())
    })()
  }, [isSignedIn])

  /**
   * Called by RankingList's CTA.
   * - Signed in: PUT to API immediately.
   * - Anonymous: persist to localStorage (already done by RankingList), then
   *   redirect to Google OAuth so on return `useEffect` above picks it up.
   */
  const handleSave = useCallback(
    async (position: OraclePosition, rows: RankingRow[]) => {
      if (!isSignedIn) {
        // RankingList already wrote to localStorage. Trigger sign-in.
        const supabase = getBrowserClient()
        await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/challenge/rankings')}`,
          },
        })
        return
      }
      const res = await fetch('/api/oracle/rankings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position, rankings: rows }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error ?? 'Failed to save rankings')
      }

      setSavedPositions(prev => {
        const next = new Set([...prev, position])
        const nextPos = ORACLE_POSITIONS.find(p => !next.has(p))
        if (nextPos) {
          setNudge(`\u2713 ${position} saved \u2014 now rank ${nextPos}`)
          setTimeout(() => setNudge(null), 4000)
        }
        return next
      })
    },
    [isSignedIn],
  )

  return (
    <div className="min-h-[100dvh] bg-pmp-black flex flex-col">
      {/* Page header */}
      <div className="px-4 pt-6 pb-4 border-b border-pmp-gray-800 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-pmp-white font-bold text-lg">My Rankings</h1>
          <p className="text-pmp-gray-600 text-xs mt-0.5">
            PPR · 2026 Oracle Challenge
          </p>
        </div>
        {!isSignedIn && !locked && (
          <SignInButton
            label="Sign in"
            redirectTo="/challenge/rankings"
            className="text-xs py-2 px-3"
          />
        )}
      </div>

      {/* Position tabs */}
      <div
        className="flex border-b border-pmp-gray-800 shrink-0"
        role="tablist"
        aria-label="Position"
      >
        {ORACLE_POSITIONS.map(pos => {
          const isActive = activePosition === pos
          const size = POSITION_LIST_SIZE[pos]
          return (
            <button
              key={pos}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActivePosition(pos)}
              className={[
                'flex-1 py-3 text-sm font-semibold transition-colors min-h-[44px]',
                isActive
                  ? 'text-pmp-white border-b-2 border-pmp-red'
                  : 'text-pmp-gray-600 hover:text-pmp-gray-500',
              ].join(' ')}
            >
              {pos}
              <span className="block text-[10px] font-normal opacity-60">
                Top {size}
              </span>
            </button>
          )
        })}
      </div>

      {/* Completion tracker */}
      <div className="px-4 py-3 border-b border-pmp-gray-800 flex items-center justify-between shrink-0">
        <div className="flex gap-3">
          {ORACLE_POSITIONS.map(pos => (
            <span key={pos} className={[
              'text-xs font-semibold',
              savedPositions.has(pos) ? 'text-pmp-red' : 'text-pmp-gray-600',
            ].join(' ')}>
              {savedPositions.has(pos) ? '\u2705' : '\u2610'} {pos}
            </span>
          ))}
        </div>
        <span className="text-pmp-gray-600 text-xs">
          {savedPositions.size} of 4
        </span>
      </div>

      {/* Nudge banner */}
      {nudge && (
        <div className="px-4 py-2 bg-pmp-gray-900 border-b border-pmp-gray-800 text-xs text-pmp-gray-500 text-center shrink-0">
          {nudge}
        </div>
      )}

      {/* Scrollable ranking area for the active position */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        <RankingList
          key={activePosition}
          position={activePosition}
          initialRows={initialRankings[activePosition] ?? []}
          players={players[activePosition] ?? []}
          locked={locked}
          isSignedIn={isSignedIn}
          onSave={handleSave}
        />
      </div>

      {/* Review & Enter CTA — shown when at least 1 position is saved and not locked */}
      {!locked && savedPositions.size >= 1 && (
        <div className="px-4 py-4 border-t border-pmp-gray-800 shrink-0">
          <Link
            href="/challenge/rankings/review"
            className="w-full bg-pmp-gray-900 border border-pmp-gray-700 text-pmp-white font-semibold py-3 rounded-xl text-sm text-center block hover:border-pmp-gray-500 transition-colors"
          >
            Review &amp; Enter Oracle Challenge &rarr;
          </Link>
        </div>
      )}
    </div>
  )
}
