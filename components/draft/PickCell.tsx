'use client'
import { useEffect, useRef, useState } from 'react'
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
  const label = `${pick.round}.${String(pick.teamSlot).padStart(2, '0')}`

  // Flash animation: fires once when isCompleted transitions false → true
  const prevCompletedRef = useRef(isCompleted)
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (!prevCompletedRef.current && isCompleted) {
      prevCompletedRef.current = isCompleted
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 600)
      return () => clearTimeout(t)
    }
    prevCompletedRef.current = isCompleted
  }, [isCompleted])

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

  const cellBg = (() => {
    if (isCurrent)                  return 'bg-[#1a0505] border-pmp-red animate-pulse'
    if (isCompleted && pick.isUser) return 'bg-[#1a0505] border-pmp-red/20'
    if (isCompleted)                return 'bg-[#1e1e1e] border-[#2a2a2a]'
    return 'bg-[#111111] border-[#1e1e1e]'
  })()

  const hoverClass = isCompleted
    ? 'hover:border-pmp-red/50 hover:shadow-[0_0_8px_rgba(220,38,38,0.25)] hover:-translate-y-0.5 cursor-grab active:cursor-grabbing'
    : 'cursor-default'

  const dropHighlight = isOver ? 'border-pmp-red' : ''

  return (
    <div
      ref={(node) => { setDragRef(node); setDropRef(node) }}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={`group relative border rounded-lg p-1.5 select-none transition-all ${flash ? 'cell-flash' : cellBg} ${hoverClass} ${dropHighlight} ${isDragging ? 'opacity-40' : ''} ${selectedPoolPlayerId && isCompleted ? 'hover:border-pmp-red' : ''}`}
    >
      <p className="text-pmp-gray-600 text-[10px] leading-none">{label}</p>
      {player ? (
        <>
          <p className="text-pmp-white text-xs font-semibold truncate mt-0.5 leading-tight">{player.name}</p>
          <p className="text-pmp-gray-500 text-[10px]">{player.position} · {player.team}</p>
        </>
      ) : isCurrent ? (
        <p className="text-pmp-red text-[10px] font-semibold mt-0.5 animate-pulse">On the clock</p>
      ) : null}
      {isCompleted && player && (
        <p className="absolute bottom-0.5 right-1 text-[8px] text-pmp-gray-700 opacity-0 group-hover:opacity-100 transition-opacity leading-none">
          drag to swap
        </p>
      )}
    </div>
  )
}
