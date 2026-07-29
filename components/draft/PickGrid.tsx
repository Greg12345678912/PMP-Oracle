'use client'
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

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto">
        <div
          className="grid gap-0.5 min-w-max"
          style={{ gridTemplateColumns: `repeat(${numTeams}, minmax(72px, 1fr))` }}
        >
          {/* Header row */}
          {Array.from({ length: numTeams }, (_, i) => (
            <div key={i} className="text-center text-pmp-gray-600 text-[10px] py-1">
              {i + 1 === userTeamSlot ? 'YOU' : `T${i + 1}`}
            </div>
          ))}

          {picks.map((pick, idx) => (
            <PickCell
              key={pick.overallPick}
              pick={pick}
              pickIndex={idx}
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
