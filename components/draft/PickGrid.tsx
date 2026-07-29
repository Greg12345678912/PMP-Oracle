'use client'
import { useMemo } from 'react'
import { DndContext, DragEndEvent } from '@dnd-kit/core'
import { PickCell } from './PickCell'
import type { PickSlot } from '@/lib/draft/types'
import type { Player } from '@/lib/data/types'

interface PickGridProps {
  picks: PickSlot[]
  playerMap: Map<string, Player>
  currentPickIndex: number
  selectedPoolPlayerId: string | null
  onAssign: (pickIndex: number, playerId: string) => void
  onSelectCell: (pickIndex: number) => void
  numTeams: number
}

export function PickGrid({
  picks, playerMap, currentPickIndex, selectedPoolPlayerId, onAssign, onSelectCell, numTeams,
}: PickGridProps) {
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const srcIndex: number = active.data.current?.pickIndex
    const dstIndex: number = over.data.current?.pickIndex
    if (srcIndex === undefined || dstIndex === undefined || srcIndex === dstIndex) return
    if (dstIndex >= currentPickIndex || srcIndex >= currentPickIndex) return

    const srcPlayerId = picks[srcIndex].playerId
    const dstPlayerId = picks[dstIndex].playerId
    if (srcPlayerId) onAssign(dstIndex, srcPlayerId)
    if (dstPlayerId) onAssign(srcIndex, dstPlayerId)
  }

  const userTeamSlot = picks.find(p => p.isUser)?.teamSlot

  // Sort picks into grid order: row-major by round, each round sorted by teamSlot (1..N)
  // Preserve original array index so engine calls (onAssign, onSelectCell) stay correct.
  const sortedPicks = useMemo(() => {
    return picks.map((pick, originalIndex) => ({ pick, originalIndex }))
      .sort((a, b) => {
        if (a.pick.round !== b.pick.round) return a.pick.round - b.pick.round
        return a.pick.teamSlot - b.pick.teamSlot
      })
  }, [picks])

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto">
        <div
          className="grid gap-0.5 min-w-max"
          style={{ gridTemplateColumns: `repeat(${numTeams}, minmax(72px, 1fr))` }}
        >
          {/* Header row */}
          {Array.from({ length: numTeams }, (_, i) => (
            <div
              key={i}
              className="sticky top-0 z-20 text-center py-2 text-[11px] font-semibold bg-[#0d0d0d] border-b border-[#1e1e1e]"
              style={i + 1 === userTeamSlot ? { color: '#ef4444' } : { color: '#4b5563' }}
            >
              {i + 1 === userTeamSlot ? '⭐ YOU' : `${i + 1}`}
            </div>
          ))}

          {sortedPicks.map(({ pick, originalIndex }) => (
            <PickCell
              key={pick.overallPick}
              pick={pick}
              pickIndex={originalIndex}
              player={pick.playerId ? playerMap.get(pick.playerId) : undefined}
              currentPickIndex={currentPickIndex}
              selectedPoolPlayerId={selectedPoolPlayerId}
              onAssign={onAssign}
              onSelectCell={onSelectCell}
            />
          ))}
        </div>
      </div>
    </DndContext>
  )
}
