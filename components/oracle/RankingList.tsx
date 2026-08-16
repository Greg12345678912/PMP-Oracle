'use client'
import { useState, useRef, useEffect } from 'react'
import type { RankingRow } from '@/lib/oracle/rankings'
import type { Player } from '@/lib/data/types'
import type { OraclePosition } from '@/lib/oracle/constants'
import { POSITION_LIST_SIZE } from '@/lib/oracle/constants'

function draftKey(position: OraclePosition) {
  return `oracle_rankings_draft_${position}`
}

function persistDraft(position: OraclePosition, rows: RankingRow[]) {
  try {
    localStorage.setItem(draftKey(position), JSON.stringify(rows))
  } catch {
    // storage full or SSR
  }
}

function readDraft(position: OraclePosition): RankingRow[] | null {
  try {
    const raw = localStorage.getItem(draftKey(position))
    if (!raw) return null
    return JSON.parse(raw) as RankingRow[]
  } catch {
    return null
  }
}

function formatLockDeadline(lockAt: string) {
  if (!lockAt) return 'the deadline'
  const d = new Date(lockAt)
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' })
  return `${date} at ${time}`
}

interface RankingListProps {
  position: OraclePosition
  initialRows: RankingRow[]
  players: Player[]
  locked: boolean
  isSignedIn: boolean
  lockAt?: string
  onSave: (position: OraclePosition, rows: RankingRow[]) => Promise<void>
  /** Called when all slots are filled — parent shows position-complete modal */
  onComplete: (rows: RankingRow[]) => void
}

export function RankingList({
  position,
  initialRows,
  players,
  locked,
  isSignedIn,
  lockAt,
  onSave,
  onComplete,
}: RankingListProps) {
  const maxSize = POSITION_LIST_SIZE[position]

  const [rows, setRows] = useState<RankingRow[]>(() => initialRows.slice(0, maxSize))
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const isFirstRender = useRef(true)
  const isLocalStorageHydration = useRef(false)
  const completedFired = useRef(false)

  // Hydrate anonymous users from localStorage draft after mount
  useEffect(() => {
    if (isSignedIn) return
    const draft = readDraft(position)
    if (draft && draft.length > 0) {
      isLocalStorageHydration.current = true
      setRows(draft.slice(0, maxSize))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist draft + mark dirty whenever rows change
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (isLocalStorageHydration.current) { isLocalStorageHydration.current = false; return }
    if (!isSignedIn) persistDraft(position, rows)
    setDirty(true)
  }, [isSignedIn, position, rows])

  // Warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // Auto-focus and scroll the input to the top quarter of the visible viewport
  // so the dropdown has room above the keyboard on iOS
  useEffect(() => {
    if (!searchOpen) return
    searchInputRef.current?.focus()

    const scrollInputIntoView = () => {
      const el = searchInputRef.current
      if (!el) return
      const vv = window.visualViewport
      const visibleHeight = vv ? vv.height : window.innerHeight
      const rect = el.getBoundingClientRect()
      const desiredTop = visibleHeight * 0.25
      const delta = rect.top - desiredTop
      if (Math.abs(delta) > 10) {
        window.scrollBy({ top: delta, behavior: 'smooth' })
      }
    }

    // Wait for iOS keyboard to finish animating (~350ms)
    const t = setTimeout(scrollInputIntoView, 350)

    const vv = window.visualViewport
    vv?.addEventListener('resize', scrollInputIntoView)

    return () => {
      clearTimeout(t)
      vv?.removeEventListener('resize', scrollInputIntoView)
    }
  }, [searchOpen])

  const rankedIds = new Set(rows.map(r => r.playerId))
  const nextSlotIndex = rows.length // 0-based index of the next empty slot

  const filtered = players
    .filter(p => !rankedIds.has(p.id) && p.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 20)

  const popularUnranked = players.filter(p => !rankedIds.has(p.id)).slice(0, 6)

  const addPlayer = (player: Player) => {
    const newRows: RankingRow[] = [
      ...rows,
      { playerRank: rows.length + 1, playerId: player.id, playerName: player.name },
    ]
    setRows(newRows)
    setSearch('')
    setSearchOpen(false)
    if (newRows.length === maxSize && !completedFired.current) {
      completedFired.current = true
      setTimeout(() => onComplete(newRows), 50)
    }
  }

  const removePlayer = (playerId: string) => {
    completedFired.current = false
    setRows(prev =>
      prev.filter(r => r.playerId !== playerId).map((r, i) => ({ ...r, playerRank: i + 1 })),
    )
    setSearchOpen(false)
    setSearch('')
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(position, rows)
      setLastSavedAt(new Date())
      setDirty(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed — try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-pmp-white font-bold text-base">
          Top {maxSize} {position} (PPR)
        </h2>
        <span className="text-pmp-gray-500 text-xs font-semibold">
          {rows.length} / {maxSize} ranked
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-pmp-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-pmp-red rounded-full transition-all duration-300"
          style={{ width: `${Math.min(100, (rows.length / maxSize) * 100)}%` }}
        />
      </div>

      {locked && (
        <div className="bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-4 py-3 text-pmp-gray-500 text-sm text-center">
          Rankings are locked for the 2026 season.
        </div>
      )}

      {/* Slots */}
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: maxSize }).map((_, i) => {
          const row = rows[i]

          // Filled slot
          if (row) {
            return (
              <div
                key={row.playerId}
                className="flex items-center gap-3 rounded-xl px-4 py-3 bg-pmp-gray-900 border border-pmp-gray-800"
              >
                <span className="text-pmp-gray-600 text-xs font-black w-5 text-right shrink-0">
                  {i + 1}
                </span>
                <span className="text-pmp-white text-sm flex-1">{row.playerName}</span>
                {!locked && (
                  <button
                    type="button"
                    onClick={() => removePlayer(row.playerId)}
                    className="text-pmp-gray-600 hover:text-pmp-gray-400 transition-colors text-lg leading-none shrink-0 p-1 -mr-1"
                    aria-label={`Remove ${row.playerName}`}
                  >
                    &times;
                  </button>
                )}
              </div>
            )
          }

          // Active "next" slot — shows search inline
          if (i === nextSlotIndex && !locked) {
            return (
              <div key={`slot-${i}`}>
                {searchOpen ? (
                  <div className="flex flex-col rounded-xl border border-pmp-red bg-pmp-gray-900 overflow-hidden">
                    {/* Search header row */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-pmp-gray-800">
                      <span className="text-pmp-gray-500 text-xs font-black w-5 text-right shrink-0">
                        {i + 1}
                      </span>
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={`Search ${position} players\u2026`}
                        className="flex-1 bg-transparent text-pmp-white text-base placeholder:text-pmp-gray-600 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => { setSearchOpen(false); setSearch('') }}
                        className="text-pmp-gray-600 hover:text-pmp-gray-400 transition-colors text-lg leading-none shrink-0"
                        aria-label="Close search"
                      >
                        &times;
                      </button>
                    </div>

                    {/* Results */}
                    <div className="max-h-56 overflow-y-auto">
                      {search.length === 0 ? (
                        popularUnranked.length > 0 ? (
                          <>
                            <p className="px-4 pt-3 pb-1 text-pmp-gray-700 text-[10px] font-bold uppercase tracking-widest">
                              Popular {position}s
                            </p>
                            {popularUnranked.map(player => (
                              <button
                                key={player.id}
                                type="button"
                                onClick={() => addPlayer(player)}
                                className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-pmp-gray-800 transition-colors min-h-[44px]"
                              >
                                <span className="text-pmp-white text-sm flex-1">{player.name}</span>
                                <span className="text-pmp-gray-500 text-xs">{player.team}</span>
                              </button>
                            ))}
                          </>
                        ) : (
                          <p className="px-4 py-3 text-pmp-gray-600 text-sm">All players ranked</p>
                        )
                      ) : filtered.length === 0 ? (
                        <p className="px-4 py-3 text-pmp-gray-600 text-sm">No players found</p>
                      ) : (
                        filtered.map(player => (
                          <button
                            key={player.id}
                            type="button"
                            onClick={() => addPlayer(player)}
                            className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-pmp-gray-800 transition-colors min-h-[44px]"
                          >
                            <span className="text-pmp-white text-sm flex-1">{player.name}</span>
                            <span className="text-pmp-gray-500 text-xs">{player.team}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    className="flex items-center gap-3 w-full rounded-xl px-4 py-3 border border-dashed border-pmp-gray-700 hover:border-pmp-gray-500 hover:bg-pmp-gray-900/40 transition-colors min-h-[44px] text-left"
                  >
                    <span className="text-pmp-gray-600 text-xs font-black w-5 text-right shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-pmp-gray-600 text-sm pl-1">+ Add player</span>
                  </button>
                )}
              </div>
            )
          }

          // Future empty slot
          return (
            <div
              key={`empty-${i}`}
              className="flex items-center gap-3 rounded-xl px-4 py-3 border border-dashed border-pmp-gray-800/50"
            >
              <span className="text-pmp-gray-800 text-xs font-black w-5 text-right shrink-0">
                {i + 1}
              </span>
              <span className="text-pmp-gray-800 text-sm pl-1">&mdash;</span>
            </div>
          )
        })}
      </div>

      {/* Save Progress — shown for partial drafts */}
      {!locked && rows.length > 0 && rows.length < maxSize && (
        <div className="pt-1">
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="w-full bg-pmp-gray-900 border border-pmp-gray-700 text-pmp-gray-400 font-semibold py-3 rounded-xl text-sm hover:border-pmp-gray-600 hover:text-pmp-gray-300 transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving\u2026' : 'Save Progress'}
          </button>
          {saveError && (
            <p className="text-pmp-red text-xs text-center mt-2">{saveError}</p>
          )}
          {!saveError && (
            <p className="text-pmp-gray-700 text-xs text-center mt-2">
              {!isSignedIn
                ? 'Sign in to save permanently'
                : (!dirty && lastSavedAt)
                  ? `\u2713 Saved at ${lastSavedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' })}`
                  : lockAt
                    ? `Locks ${formatLockDeadline(lockAt)}`
                    : 'Rankings lock at the deadline'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
