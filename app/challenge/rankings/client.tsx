'use client'
import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { RankingList } from '@/components/oracle/RankingList'
import { ProfileGate } from '@/components/oracle/ProfileGate'
import type { RankingRow } from '@/lib/oracle/rankings'
import type { Player } from '@/lib/data/types'
import type { OraclePosition } from '@/lib/oracle/constants'
import { ORACLE_POSITIONS, POSITION_LIST_SIZE } from '@/lib/oracle/constants'

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
    () => new Set(ORACLE_POSITIONS.filter(p => (initialRankings[p]?.length ?? 0) > 0)),
  )
  const [showProfileGate, setShowProfileGate] = useState(false)

  // Position-complete modal state
  const [pendingCompletion, setPendingCompletion] = useState<{
    position: OraclePosition
    rows: RankingRow[]
  } | null>(null)
  const [showPositionModal, setShowPositionModal] = useState(false)
  const [modalSaving, setModalSaving] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  // All-done modal state
  const [showAllDoneModal, setShowAllDoneModal] = useState(false)

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
          const truncated = rows.slice(0, POSITION_LIST_SIZE[pos])
          const res = await fetch('/api/oracle/rankings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ position: pos, rankings: truncated }),
          })
          if (res.ok) localStorage.removeItem(draftKey(pos))
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
        if (next.size === ORACLE_POSITIONS.length) {
          setShowAllDoneModal(true)
        }
        return next
      })
      router.refresh()
    },
    [isSignedIn, router],
  )

  /** Called by RankingList when all slots are filled */
  const handleComplete = useCallback(
    (rows: RankingRow[]) => {
      setPendingCompletion({ position: activePosition, rows })
      setShowPositionModal(true)
      setModalError(null)
    },
    [activePosition],
  )

  const handleContinueFromModal = async () => {
    if (!pendingCompletion) return
    const { position, rows } = pendingCompletion
    // Compute next unsaved position optimistically (before state update)
    const alreadySaved = new Set([...savedPositions, position])
    const nextPos = ORACLE_POSITIONS.find(p => !alreadySaved.has(p))

    setModalSaving(true)
    setModalError(null)
    try {
      await handleSave(position, rows)
      setShowPositionModal(false)
      setPendingCompletion(null)
      if (nextPos) setActivePosition(nextPos)
    } catch (e) {
      setModalError(e instanceof Error ? e.message : 'Save failed — try again')
    } finally {
      setModalSaving(false)
    }
  }

  // Compute what the "Continue" button label should say
  const nextAfterCurrent = (() => {
    if (!pendingCompletion) return null
    const alreadySaved = new Set([...savedPositions, pendingCompletion.position])
    return ORACLE_POSITIONS.find(p => !alreadySaved.has(p)) ?? null
  })()

  return (
    <div className="min-h-[100dvh] bg-pmp-black flex flex-col">
      {showProfileGate && (
        <ProfileGate
          redirectTo="/challenge/rankings"
          onDismiss={() => setShowProfileGate(false)}
        />
      )}

      {/* Position-complete modal */}
      {showPositionModal && pendingCompletion && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4">
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-pmp-white font-bold text-lg mb-1">
              {pendingCompletion.position} complete!
            </h3>
            <p className="text-pmp-gray-500 text-sm mb-6">
              {nextAfterCurrent
                ? `You\u2019ve ranked all 10 ${pendingCompletion.position}s. Ready to move on to ${nextAfterCurrent}?`
                : `You\u2019ve ranked all 10 ${pendingCompletion.position}s. That\u2019s all four positions\u2014ready to submit?`}
            </p>
            {modalError && (
              <p className="text-pmp-red text-xs text-center mb-4">{modalError}</p>
            )}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleContinueFromModal}
                disabled={modalSaving}
                className="w-full bg-pmp-red text-pmp-white font-bold py-4 rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {modalSaving
                  ? 'Saving\u2026'
                  : nextAfterCurrent
                    ? `Continue to ${nextAfterCurrent}`
                    : 'Review & Submit'}
              </button>
              <button
                type="button"
                onClick={() => { setShowPositionModal(false); setModalError(null) }}
                disabled={modalSaving}
                className="w-full text-pmp-gray-500 text-sm py-2 hover:text-pmp-gray-300 transition-colors disabled:opacity-50"
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* All-done modal */}
      {showAllDoneModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4">
          <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-pmp-white font-bold text-lg mb-1">All rankings saved!</h3>
            <p className="text-pmp-gray-500 text-sm mb-6">
              You&rsquo;ve ranked all four positions. Review your picks and submit before the deadline.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                href="/challenge/rankings/review"
                className="block w-full bg-pmp-red text-pmp-white font-bold py-4 rounded-xl text-sm text-center hover:opacity-90 transition-opacity"
              >
                Review &amp; Submit &rarr;
              </Link>
              <button
                type="button"
                onClick={() => setShowAllDoneModal(false)}
                className="w-full text-pmp-gray-500 text-sm py-2 hover:text-pmp-gray-300 transition-colors"
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="px-4 pt-5 pb-4 border-b border-pmp-gray-800 shrink-0">
        <h1 className="text-pmp-white font-bold text-lg">
          {locked ? 'Your Official Locked Rankings' : 'My Rankings'}
        </h1>
        <p className="text-pmp-gray-600 text-xs mt-0.5">PPR &middot; 2026 Oracle Challenge</p>
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
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActivePosition(pos)}
              className={[
                'flex-1 py-3 text-sm font-semibold transition-colors min-h-[44px] flex flex-col items-center justify-center',
                isActive
                  ? 'text-pmp-white border-b-2 border-pmp-red'
                  : savedPositions.has(pos)
                    ? 'text-pmp-gray-400 hover:text-pmp-gray-300'
                    : 'text-pmp-gray-600 hover:text-pmp-gray-500',
              ].join(' ')}
            >
              {savedPositions.has(pos) ? `\u2713 ${pos}` : pos}
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
            <span
              key={pos}
              className={[
                'text-xs font-semibold',
                savedPositions.has(pos) ? 'text-pmp-red' : 'text-pmp-gray-600',
              ].join(' ')}
            >
              {savedPositions.has(pos) ? '\u2705' : '\u2610'} {pos}
            </span>
          ))}
        </div>
        <span className="text-pmp-gray-600 text-xs">{savedPositions.size} of 4</span>
      </div>

      {/* Submit button — shown once all 4 saved */}
      {savedPositions.size === ORACLE_POSITIONS.length && (
        <div className="px-4 py-3 border-b border-pmp-gray-800 shrink-0">
          <Link
            href="/challenge/rankings/review"
            className="block w-full bg-pmp-red text-pmp-white font-bold py-3 rounded-xl text-sm text-center hover:opacity-90 transition-opacity"
          >
            Review &amp; Submit &rarr;
          </Link>
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
          lockAt={lockAt}
          onSave={handleSave}
          onComplete={handleComplete}
        />
      </div>
    </div>
  )
}
