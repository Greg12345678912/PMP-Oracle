'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { RankingRowItem } from './RankingRow'
import type { RankingRow } from '@/lib/oracle/rankings'
import type { Player } from '@/lib/data/types'
import type { OraclePosition } from '@/lib/oracle/constants'
import { POSITION_LIST_SIZE } from '@/lib/oracle/constants'

/** localStorage key for a position's draft state */
function draftKey(position: OraclePosition) {
  return `oracle_rankings_draft_${position}`
}

/** Persist rows to localStorage (best-effort, no throw) */
function persistDraft(position: OraclePosition, rows: RankingRow[]) {
  try {
    localStorage.setItem(draftKey(position), JSON.stringify(rows))
  } catch {
    // storage full or SSR — ignore
  }
}

/** Read rows from localStorage (best-effort) */
function readDraft(position: OraclePosition): RankingRow[] | null {
  try {
    const raw = localStorage.getItem(draftKey(position))
    if (!raw) return null
    return JSON.parse(raw) as RankingRow[]
  } catch {
    return null
  }
}

interface RankingListProps {
  position: OraclePosition
  initialRows: RankingRow[]
  players: Player[]
  locked: boolean
  isSignedIn: boolean
  /** True when all 4 positions have been saved — enables "Submit Picks →" mode */
  allSaved?: boolean
  /** Called when user clicks "Save Rankings" — handles auth gate externally */
  onSave: (position: OraclePosition, rows: RankingRow[]) => Promise<void>
}

export function RankingList({
  position,
  initialRows,
  players,
  locked,
  isSignedIn,
  allSaved = false,
  onSave,
}: RankingListProps) {
  const maxSize = POSITION_LIST_SIZE[position]

  /** Seed rows from DB (signed-in) or localStorage draft (anonymous).
   *  Signed-in users always use DB rows — localStorage is anonymous-only. */
  const [rows, setRows] = useState<RankingRow[]>(() => {
    if (typeof window === 'undefined' || isSignedIn) return initialRows.slice(0, maxSize)
    const draft = readDraft(position)
    const source = draft && draft.length > 0 ? draft : initialRows
    return source.slice(0, maxSize)
  })

  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  // dirty = rows have changed since last save (or since mount if never saved)
  const [dirty, setDirty] = useState(false)

  const rankedIds = new Set(rows.map(r => r.playerId))

  /* Auto-save draft (anonymous) and mark dirty whenever rows change */
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (!isSignedIn) persistDraft(position, rows)
    setDirty(true)
  }, [isSignedIn, position, rows])

  /* dnd-kit sensors — PointerSensor handles mouse + touch, TouchSensor for better mobile */
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setRows(prev => {
      const oldIndex = prev.findIndex(r => r.playerId === active.id)
      const newIndex = prev.findIndex(r => r.playerId === over.id)
      return arrayMove(prev, oldIndex, newIndex).map((r, i) => ({
        ...r,
        playerRank: i + 1,
      }))
    })
  }, [])

  const addPlayer = (player: Player) => {
    if (rows.length >= maxSize || rankedIds.has(player.id)) return
    setRows(prev => [
      ...prev,
      {
        playerRank: prev.length + 1,
        playerId: player.id,
        playerName: player.name,
      },
    ])
    setSearch('')
  }

  const removePlayer = (playerId: string) => {
    setRows(prev =>
      prev
        .filter(r => r.playerId !== playerId)
        .map((r, i) => ({ ...r, playerRank: i + 1 })),
    )
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

  const filtered = players
    .filter(
      p =>
        !rankedIds.has(p.id) &&
        p.name.toLowerCase().includes(search.toLowerCase()),
    )
    .slice(0, 30)

  const posLabel = `Top ${maxSize} ${position} (PPR)`

  return (
    /* pb-24 ensures content isn't hidden behind sticky CTA */
    <div className="flex flex-col gap-4 pb-24">
      {/* Header: position label + progress */}
      <div className="flex items-center justify-between">
        <h2 className="text-pmp-white font-bold text-base">{posLabel}</h2>
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

      {/* Sorted ranked list */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={rows.map(r => r.playerId)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-1.5">
            {rows.map((row, i) => (
              <RankingRowItem
                key={row.playerId}
                row={row}
                rank={i + 1}
                locked={locked}
                onRemove={() => removePlayer(row.playerId)}
              />
            ))}

            {/* Empty-slot placeholders — show next 3 (or remaining if fewer) */}
            {!locked && Array.from({
              length: Math.min(3, maxSize - rows.length),
            }).map((_, i) => (
              <div
                key={`empty-${rows.length + i}`}
                className="flex items-center gap-3 rounded-xl px-4 py-3 border border-dashed border-pmp-gray-800"
              >
                <span className="text-pmp-gray-700 text-xs font-black w-5 text-right shrink-0">
                  {rows.length + i + 1}
                </span>
                <span className="text-pmp-gray-700 text-sm pl-1">
                  {i === 0 ? 'Tap a player below to add' : '—'}
                </span>
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Player pool — hidden when full or locked */}
      {!locked && rows.length < maxSize && (
        <div className="flex flex-col gap-3">
          {/* Popular players — secondary suggestion, shown when not searching */}
          {search.length === 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-pmp-gray-700 text-[10px] font-bold uppercase tracking-widest">
                Popular {position}s
              </p>
              {players
                .filter(p => !rankedIds.has(p.id))
                .slice(0, 8)
                .map(player => (
                  <button
                    key={player.id}
                    onClick={() => addPlayer(player)}
                    className="flex items-center gap-3 px-3 py-2.5 bg-pmp-gray-900/60 border border-pmp-gray-800/60 rounded-lg text-left hover:border-pmp-gray-700 hover:bg-pmp-gray-900 active:bg-pmp-gray-800 transition-colors min-h-[44px]"
                  >
                    <span className="text-pmp-gray-400 text-sm flex-1">{player.name}</span>
                    <span className="text-pmp-gray-600 text-xs">{player.team}</span>
                    <span className="text-pmp-gray-600 text-base leading-none">+</span>
                  </button>
                ))}
            </div>
          )}

          {/* Search */}
          <div className="flex flex-col gap-2">
            <p className="text-pmp-gray-700 text-[10px] font-bold uppercase tracking-widest">
              Search Everyone
            </p>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${position} players…`}
              className="bg-pmp-gray-900 border border-pmp-gray-700 text-pmp-white rounded-xl px-4 py-3 text-sm placeholder:text-pmp-gray-600 focus:outline-none focus:border-pmp-red transition-colors"
            />
            {search.length > 0 && (
              <div className="flex flex-col gap-1 max-h-52 overflow-y-auto rounded-xl border border-pmp-gray-800 bg-pmp-gray-900">
                {filtered.length === 0 ? (
                  <p className="px-4 py-3 text-pmp-gray-600 text-sm">No players found</p>
                ) : (
                  filtered.map(player => (
                    <button
                      key={player.id}
                      onClick={() => addPlayer(player)}
                      className="flex items-center gap-2 px-4 py-3 text-left hover:bg-pmp-gray-800 transition-colors min-h-[44px]"
                    >
                      <span className="text-pmp-white text-sm flex-1">{player.name}</span>
                      <span className="text-pmp-gray-500 text-xs">{player.team}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Single sticky CTA — morphs between Save Rankings and Submit Picks */}
      {!locked && (
        <div className="fixed bottom-[calc(52px+env(safe-area-inset-bottom,0px))] left-0 right-0 z-50 px-4 pb-3 pt-3 bg-gradient-to-t from-pmp-black via-pmp-black/95 to-transparent pointer-events-none">
          <div className="pointer-events-auto max-w-xl mx-auto">
            {allSaved && !dirty ? (
              <Link
                href="/challenge/rankings/review"
                className="block w-full bg-pmp-red text-pmp-white font-bold py-4 rounded-xl text-sm tracking-wide text-center hover:opacity-90 transition-opacity active:scale-[0.98]"
              >
                Submit Picks &rarr;
              </Link>
            ) : (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving || rows.length === 0}
                  className="w-full bg-pmp-red text-pmp-white font-bold py-4 rounded-xl text-sm tracking-wide hover:opacity-90 transition-opacity disabled:opacity-40 active:scale-[0.98]"
                >
                  {saving
                    ? 'Saving\u2026'
                    : (!dirty && lastSavedAt)
                      ? `\u2713 Saved \u00b7 ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : isSignedIn
                        ? 'Save Rankings'
                        : `Save Draft (${rows.length}/${maxSize})`}
                </button>
                {saveError && (
                  <p className="text-pmp-red text-xs text-center mt-2">{saveError}</p>
                )}
                {!saveError && !isSignedIn && rows.length > 0 && (
                  <p className="text-pmp-gray-600 text-xs text-center mt-2">
                    Draft saved locally · Sign in to lock in permanently
                  </p>
                )}
                {!saveError && isSignedIn && !saving && (
                  <p className="text-pmp-gray-600 text-xs text-center mt-2">
                    All rankings lock automatically on Sep 9 at 5:00 PM ET
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
