'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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

// ─── Sortable filled slot ─────────────────────────────────────────────────────

function SortableSlot({
  row,
  index,
  locked,
  onRemove,
}: {
  row: RankingRow
  index: number
  locked: boolean
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.playerId,
    disabled: locked,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      {...attributes}
      className="flex items-center gap-2 rounded-xl px-3 py-3 bg-pmp-gray-900 border border-pmp-gray-800"
    >
      {/* Drag handle — rank number + grip dots */}
      <div
        {...listeners}
        className="flex items-center gap-1.5 shrink-0 touch-none cursor-grab active:cursor-grabbing select-none"
        aria-label="Drag to reorder"
      >
        <span className="text-pmp-gray-600 text-xs font-black w-5 text-right">{index + 1}</span>
        {!locked && (
          <span className="text-pmp-gray-700 text-sm leading-none">⠿</span>
        )}
      </div>

      <span className="text-pmp-white text-sm flex-1 pl-0.5">{row.playerName}</span>

      {!locked && (
        <button
          type="button"
          onClick={onRemove}
          className="text-pmp-gray-600 hover:text-pmp-gray-400 transition-colors text-lg leading-none shrink-0 p-1 -mr-1"
          aria-label={`Remove ${row.playerName}`}
        >
          &times;
        </button>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface RankingListProps {
  position: OraclePosition
  initialRows: RankingRow[]
  players: Player[]
  locked: boolean
  isSignedIn: boolean
  lockAt?: string
  onSave: (position: OraclePosition, rows: RankingRow[]) => Promise<void>
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

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

  // Auto-focus and scroll the input above the keyboard on iOS
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

    const t = setTimeout(scrollInputIntoView, 350)
    const vv = window.visualViewport
    vv?.addEventListener('resize', scrollInputIntoView)
    return () => {
      clearTimeout(t)
      vv?.removeEventListener('resize', scrollInputIntoView)
    }
  }, [searchOpen])

  const rankedIds = new Set(rows.map(r => r.playerId))
  const nextSlotIndex = rows.length

  const filtered = players
    .filter(p => !rankedIds.has(p.id) && p.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 20)

  const popularUnranked = players.filter(p => !rankedIds.has(p.id)).slice(0, 6)

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setRows(prev => {
      const oldIndex = prev.findIndex(r => r.playerId === active.id)
      const newIndex = prev.findIndex(r => r.playerId === over.id)
      return arrayMove(prev, oldIndex, newIndex).map((r, i) => ({ ...r, playerRank: i + 1 }))
    })
  }, [])

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
        {/* Filled slots — draggable to reorder */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={rows.map(r => r.playerId)}
            strategy={verticalListSortingStrategy}
          >
            {rows.map((row, i) => (
              <SortableSlot
                key={row.playerId}
                row={row}
                index={i}
                locked={locked}
                onRemove={() => removePlayer(row.playerId)}
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* Next empty slot — click to open search */}
        {!locked && nextSlotIndex < maxSize && (
          <div>
            {searchOpen ? (
              <div className="flex flex-col rounded-xl border border-pmp-red bg-pmp-gray-900 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-pmp-gray-800">
                  <span className="text-pmp-gray-500 text-xs font-black w-5 text-right shrink-0">
                    {nextSlotIndex + 1}
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
                  {nextSlotIndex + 1}
                </span>
                <span className="text-pmp-gray-600 text-sm pl-1">+ Add player</span>
              </button>
            )}
          </div>
        )}

        {/* Remaining empty placeholders */}
        {Array.from({ length: Math.max(0, maxSize - nextSlotIndex - (locked ? 0 : 1)) }).map((_, i) => {
          const slotNum = nextSlotIndex + (locked ? 1 : 2) + i
          return (
            <div
              key={`empty-${slotNum}`}
              className="flex items-center gap-3 rounded-xl px-4 py-3 border border-dashed border-pmp-gray-800/50"
            >
              <span className="text-pmp-gray-800 text-xs font-black w-5 text-right shrink-0">
                {slotNum}
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
