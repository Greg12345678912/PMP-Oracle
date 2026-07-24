'use client'
import { useState, useCallback, useEffect } from 'react'
import { v4 as uuid } from 'uuid'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
  DragOverlay,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { TierRow } from './TierRow'
import { PlayerPool } from './PlayerPool'
import { OfficialPMPButton } from './OfficialPMPButton'
import { Button } from '@/components/ui/Button'
import { PlayerCard } from './PlayerCard'
import { encodeTierState, decodeTierState } from '@/lib/share/encode'
import { loadPMPRankings } from '@/lib/data/pmp-rankings'
import { analytics } from '@/lib/analytics/events'
import type { Player, Tier, TierState, Position } from '@/lib/data/types'
import { DEFAULT_TIER_LABELS } from '@/lib/data/types'

// --- Pure state helpers (exported for testing) ---

export function buildInitialState(players: Player[], position: Position): TierState {
  return {
    tiers: DEFAULT_TIER_LABELS.map(label => ({
      id: `default-tier-${label}`,
      label,
      playerIds: [],
    })),
    pool: players.map(p => p.id),
    position,
  }
}

export function clearAll(state: TierState): TierState {
  const allTierIds = state.tiers.flatMap(t => t.playerIds)
  return {
    ...state,
    tiers: state.tiers.map(t => ({ ...t, playerIds: [] })),
    pool: [...state.pool, ...allTierIds],
  }
}

export function resetTiers(state: TierState, players: Player[]): TierState {
  return buildInitialState(players, state.position)
}

export function applyMoveToTier(
  state: TierState,
  playerId: string,
  fromTierId: string | 'pool',
  toTierId: string | 'pool',
): TierState {
  // Remove from source
  let newTiers = state.tiers.map(t => ({
    ...t,
    playerIds: t.playerIds.filter(id => id !== playerId),
  }))
  let newPool = state.pool.filter(id => id !== playerId)

  // Add to destination
  if (toTierId === 'player-pool') {
    newPool = [...newPool, playerId]
  } else {
    const destId = toTierId.replace('tier-', '')
    newTiers = newTiers.map(t =>
      t.id === destId ? { ...t, playerIds: [...t.playerIds, playerId] } : t
    )
  }

  return { ...state, tiers: newTiers, pool: newPool }
}

// --- Component ---

interface TierBuilderProps {
  players: Player[]
  position: Position
  loading?: boolean
  onTiersChange?: (tiers: Tier[]) => void
}

export function TierBuilder({ players, position, loading, onTiersChange }: TierBuilderProps) {
  const [state, setState] = useState<TierState>(() => buildInitialState(players, position))
  const [history, setHistory] = useState<TierState[]>([])
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState(false)

  // Load from share URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const share = params.get('share')
    if (share) {
      const decoded = decodeTierState(share)
      if (decoded) {
        setState(prev => {
          const rankedIds = new Set(decoded.flatMap(t => t.playerIds))
          const remainingPool = prev.pool.filter(id => !rankedIds.has(id))
          return { ...prev, tiers: decoded, pool: remainingPool }
        })
      }
    }
  }, [])

  // Auto-load official rankings when ?loadOfficial=true
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('loadOfficial') !== 'true') return
    loadPMPRankings(position).then(rankings => {
      const tiers: Tier[] = Object.entries(rankings.tiers).map(([label, playerIds]) => ({
        id: uuid(),
        label,
        playerIds,
      }))
      setState(prev => {
        const rankedIds = new Set(tiers.flatMap(t => t.playerIds))
        const newPool = prev.pool.filter(id => !rankedIds.has(id))
        return { ...prev, tiers, pool: newPool }
      })
      setViewMode(true)
      analytics.officialRankingsLoaded(position)
    }).catch(() => { /* fail silently — button still available */ })
  }, [position])

  // Notify parent when tiers change
  useEffect(() => {
    onTiersChange?.(state.tiers)
  }, [state.tiers, onTiersChange])

  const pushHistory = useCallback((current: TierState) => {
    setHistory(prev => [...prev.slice(-19), current]) // keep last 20
  }, [])

  const editSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const lockedSensors = useSensors() // no sensors = drag disabled
  const sensors = viewMode ? lockedSensors : editSensors

  const handleDragStart = ({ active }: DragStartEvent) => {
    const playerId = String(active.data.current?.playerId ?? active.id)
    setActivePlayerId(playerId)
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActivePlayerId(null)
    if (!over) return

    const playerId = String(active.data.current?.playerId ?? active.id)
    const overId = String(over.id)

    // Find where it came from
    const fromTier = state.tiers.find(t => t.playerIds.includes(playerId))
    const fromId = fromTier ? `tier-${fromTier.id}` : 'player-pool'

    // No-op if dropped on the same zone
    if (fromId === overId) return

    pushHistory(state)
    setState(prev => applyMoveToTier(prev, playerId, fromId, overId))
  }

  const handleUndo = () => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    setState(prev)
  }

  const handleReset = () => {
    pushHistory(state)
    setState(resetTiers(state, players))
  }

  const handleClearAll = () => {
    pushHistory(state)
    setState(clearAll(state))
  }

  const handleRandomize = () => {
    setState(prev => ({
      ...prev,
      pool: [...prev.pool].sort(() => Math.random() - 0.5),
    }))
  }

  const handleRenameTier = useCallback((tierId: string, newLabel: string) => {
    setState(prev => ({
      ...prev,
      tiers: prev.tiers.map(t => t.id === tierId ? { ...t, label: newLabel } : t),
    }))
  }, [])

  const handleDeleteTier = useCallback((tierId: string) => {
    setState(prev => {
      pushHistory(prev)
      const tier = prev.tiers.find(t => t.id === tierId)
      if (!tier) return prev
      return {
        ...prev,
        tiers: prev.tiers.filter(t => t.id !== tierId),
        pool: [...prev.pool, ...tier.playerIds],
      }
    })
  }, [pushHistory])

  const handleAddTier = () => {
    setState(prev => ({
      ...prev,
      tiers: [...prev.tiers, { id: uuid(), label: 'New', playerIds: [] }],
    }))
  }

  const handleOfficialLoad = (tiers: Tier[]) => {
    pushHistory(state)
    const rankedIds = tiers.flatMap(t => t.playerIds)
    const newPool = players.map(p => p.id).filter(id => !rankedIds.includes(id))
    setState(prev => ({ ...prev, tiers, pool: newPool }))
  }

  const handleCopyLink = async () => {
    const encoded = encodeTierState(state.tiers)
    const url = `${window.location.origin}${window.location.pathname}?share=${encoded}`
    await navigator.clipboard.writeText(url)
    analytics.tierListShared('copy_link', position)
  }

  const activePlayer = activePlayerId
    ? players.find(p => p.id === activePlayerId)
    : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {!viewMode && <OfficialPMPButton position={position} onLoad={handleOfficialLoad} />}
          <div className="flex gap-2 ml-auto">
            {!viewMode && (
              <>
                <Button variant="ghost" size="sm" onClick={handleUndo} disabled={history.length === 0}>
                  Undo
                </Button>
                <Button variant="ghost" size="sm" onClick={handleClearAll}>
                  Clear All
                </Button>
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  Reset
                </Button>
                <Button variant="ghost" size="sm" onClick={handleAddTier}>
                  + Tier
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={handleCopyLink}>
              Copy Link
            </Button>
          </div>
        </div>

        {/* Tiers */}
        <div className="flex flex-col gap-2">
          {state.tiers.map(tier => (
            <TierRow
              key={tier.id}
              tier={tier}
              players={players}
              onRename={handleRenameTier}
              onDelete={handleDeleteTier}
              readOnly={viewMode}
            />
          ))}
        </div>

        {/* Player Pool */}
        <PlayerPool
          allPlayers={players}
          poolIds={state.pool}
          loading={loading}
          onRandomize={handleRandomize}
        />
      </div>

      {/* Drag overlay for smooth drag preview */}
      <DragOverlay>
        {activePlayer && (
          <PlayerCard
            player={activePlayer}
            draggableId={`overlay-${activePlayer.id}`}
            compact
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}
