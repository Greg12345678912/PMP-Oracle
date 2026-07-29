'use client'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { PickSlot } from '@/lib/draft/types'
import type { Player } from '@/lib/data/types'

interface PickCellProps {
  pick: PickSlot
  pickIndex: number
  player: Player | undefined
  currentPickIndex: number
  selectedPoolPlayerId: string | null
  onAssign: (pickIndex: number, playerId: string) => void
  onSelectCell: (pickIndex: number) => void
}

export function PickCell({
  pick, pickIndex, player, currentPickIndex, selectedPoolPlayerId, onAssign, onSelectCell,
}: PickCellProps) {
  const isCompleted = pickIndex < currentPickIndex
  const isCurrent = pickIndex === currentPickIndex
  const label = `${pick.round}.${String(pick.pickInRound).padStart(2, '0')}`

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `pick-${pickIndex}`,
    disabled: !isCompleted || !player,
    data: { pickIndex, playerId: player?.id },
  })

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${pickIndex}`,
    disabled: !isCompleted,
    data: { pickIndex },
  })

  const handleClick = () => {
    if (!isCompleted) return
    if (selectedPoolPlayerId) {
      onAssign(pickIndex, selectedPoolPlayerId)
    } else {
      onSelectCell(pickIndex)
    }
  }

  const bg = pick.isUser ? 'bg-[#1a0a0a] border-pmp-red/30' : 'bg-pmp-gray-900 border-pmp-gray-800'
  const activeBg = isOver ? 'border-pmp-red' : ''
  const currentBg = isCurrent ? 'border-pmp-red animate-pulse' : ''

  return (
    <div
      ref={(node) => { setDragRef(node); setDropRef(node) }}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={`relative border rounded-lg p-1.5 cursor-pointer select-none transition-all ${bg} ${activeBg} ${currentBg} ${isDragging ? 'opacity-40' : ''} ${selectedPoolPlayerId && isCompleted ? 'hover:border-pmp-red' : ''}`}
    >
      <p className="text-pmp-gray-600 text-[10px] leading-none">{label}</p>
      {player ? (
        <>
          <p className="text-pmp-white text-xs font-semibold truncate mt-0.5 leading-tight">{player.name}</p>
          <p className="text-pmp-gray-500 text-[10px]">{player.position} · {player.team}</p>
        </>
      ) : (
        <p className="text-pmp-gray-700 text-xs mt-0.5">{isCurrent ? 'On the clock' : label}</p>
      )}
    </div>
  )
}
