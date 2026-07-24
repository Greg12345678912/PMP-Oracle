'use client'
import { useState, useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { PlayerCard } from './PlayerCard'
import { SearchBar } from './SearchBar'
import { Button } from '@/components/ui/Button'
import { PlayerCardSkeleton } from '@/components/ui/Skeleton'
import type { Player } from '@/lib/data/types'

interface PlayerPoolProps {
  allPlayers: Player[]
  poolIds: string[]
  loading?: boolean
  onRandomize: () => void
}

export function PlayerPool({ allPlayers, poolIds, loading, onRandomize }: PlayerPoolProps) {
  const [filteredIds, setFilteredIds] = useState<string[] | null>(null)

  const { setNodeRef } = useDroppable({ id: 'player-pool' })

  const poolPlayers = allPlayers.filter(p => poolIds.includes(p.id))

  const handleFilter = useCallback((filtered: Player[]) => {
    const filteredFromPool = filtered.filter(p => poolIds.includes(p.id))
    setFilteredIds(filteredFromPool.map(p => p.id))
  }, [poolIds])

  const displayIds = filteredIds ?? poolIds
  const displayPlayers = allPlayers.filter(p => displayIds.includes(p.id))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-pmp-gray-500">
          Player Pool ({poolIds.length} remaining)
        </span>
        <Button variant="ghost" size="sm" onClick={onRandomize} aria-label="Randomize player order">
          Shuffle
        </Button>
      </div>

      <SearchBar players={poolPlayers} onFilter={handleFilter} />

      <div
        ref={setNodeRef}
        className="flex flex-wrap gap-2 min-h-[120px] rounded-xl border border-pmp-gray-800 bg-pmp-gray-900 p-3"
        role="group"
        aria-label="Available players"
      >
        {loading ? (
          Array.from({ length: 20 }).map((_, i) => <PlayerCardSkeleton key={i} />)
        ) : displayPlayers.length === 0 ? (
          <p className="text-pmp-gray-600 text-sm italic self-center mx-auto">
            No players found
          </p>
        ) : (
          displayPlayers.map(player => (
            <PlayerCard
              key={player.id}
              player={player}
              draggableId={`pool-${player.id}`}
            />
          ))
        )}
      </div>
    </div>
  )
}
