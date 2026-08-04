'use client'
import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { RankingList } from '@/components/oracle/RankingList'
import { ProfileGate } from '@/components/oracle/ProfileGate'
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
  lockAt?: string
}

export function RankingsClient({
  initialRankings,
  players,
  locked,
  isSignedIn,
  lockAt,
}: RankingsClientProps) {
  const router = useRouter()
  const [activePosition, setActivePosition] = useState<OraclePosition>('QB')
  const [savedPositions, setSavedPositions] = useState<Set<OraclePosition>>(
    () => new Set(ORACLE_POSITIONS.filter(p => (initialRankings[p]?.length ?? 0) > 0))
  )
  const [nudge, setNudge] = useState<string | null>(null)
  const [showProfileGate, setShowProfileGate] = useState(false)

  /**
   * On sign-in return: upload any localStorage drafts to the DB.
   */
  useEffect(() => {
    if (!isSignedIn || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('synced') === '1') return

    void (async () => {
      for (const pos of ORACLE_POSITIONS) {
        try {
          const raw = localStorage.getItem(draftKey(pos))
          if (!raw) continue
          const rows: RankingRow[] = JSON.parse(raw)
          if (!rows.length) continue
          // Truncate to current maxSize before syncing — prevents validation errors
          // when list size constants have changed since draft was saved
          const truncated = rows.slice(0, POSITION_LIST_SIZE[pos])
          const res = await fetch('/api/oracle/rankings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ position: pos, rankings: truncated }),
          })
          // Only clear localStorage if the save actually succeeded
          if (res.ok) {
            localStorage.removeItem(draftKey(pos))
          }
        } catch {
          // best-effort
        }
      }
      const url = new URL(window.location.href)
      url.searchParams.set('synced', '1')
      window.history.replaceState(null, '', url.toString())
    })()
  }, [isSignedIn])

  const handleSave = useCallback(
    async (position: OraclePosition, rows: RankingRow[]) => {
      if (!isSignedIn) {
        // RankingList already wrote to localStorage — show profile gate instead of
        // immediately redirecting. User clicks "Enter with Google" from there.
        setShowProfileGate(true)
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
      router.refresh()
    },
    [isSignedIn],
  )

  return (
    <div className="min-h-[100dvh] bg-pmp-black flex flex-col">
      {showProfileGate && (
        <ProfileGate
          redirectTo="/challenge/rankings"
          onDismiss={() => setShowProfileGate(false)}
        />
      )}

      {/* Page header */}
      <div className="px-4 pt-5 pb-4 border-b border-pmp-gray-800 shrink-0">
        <h1 className="text-pmp-white font-bold text-lg">
          {locked ? 'Your Official Locked Rankings' : 'My Rankings'}
        </h1>
        <p className="text-pmp-gray-600 text-xs mt-0.5">PPR · 2026 Oracle Challenge</p>
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
                  : savedPositions.has(pos)
                    ? 'text-pmp-gray-400 hover:text-pmp-gray-300'
                    : 'text-pmp-gray-600 hover:text-pmp-gray-500',
              ].join(' ')}
            >
              {savedPositions.has(pos) ? `✓ ${pos}` : pos}
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

      {/* Scrollable ranking area */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        <RankingList
          key={activePosition}
          position={activePosition}
          initialRows={initialRankings[activePosition] ?? []}
          players={players[activePosition] ?? []}
          locked={locked}
          isSignedIn={isSignedIn}
          allSaved={savedPositions.size === 4}
          lockAt={lockAt}
          onSave={handleSave}
        />
      </div>

    </div>
  )
}
