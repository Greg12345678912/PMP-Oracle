'use client'
import { useState, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
import { PlayerCard } from './PlayerCard'
import type { Tier, Player } from '@/lib/data/types'

interface TierRowProps {
  tier: Tier
  players: Player[]
  onRename: (tierId: string, newLabel: string) => void
  onDelete: (tierId: string) => void
  isOver?: boolean
}

const TIER_COLORS: Record<string, string> = {
  S: '#E10600',
  A: '#FF6B00',
  B: '#FFB800',
  C: '#9ACD32',
  D: '#4A90E2',
  F: '#6B6B6B',
}

function getTierLabelColor(label: string): string {
  return TIER_COLORS[label.toUpperCase()] ?? '#E10600'
}

export function TierRow({ tier, players, onRename, onDelete }: TierRowProps) {
  const [editing, setEditing] = useState(false)
  const [labelValue, setLabelValue] = useState(tier.label)
  const inputRef = useRef<HTMLInputElement>(null)

  const { setNodeRef, isOver } = useDroppable({ id: `tier-${tier.id}` })

  const tierPlayers = tier.playerIds
    .map(id => players.find(p => p.id === id))
    .filter((p): p is Player => p !== undefined)

  const handleLabelClick = () => {
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleLabelBlur = () => {
    setEditing(false)
    const trimmed = labelValue.trim()
    if (trimmed && trimmed !== tier.label) {
      onRename(tier.id, trimmed)
    } else {
      setLabelValue(tier.label)
    }
  }

  const handleLabelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') inputRef.current?.blur()
    if (e.key === 'Escape') {
      setLabelValue(tier.label)
      setEditing(false)
    }
  }

  return (
    <div className={cn(
      'flex items-stretch rounded-xl border transition-colors duration-200 min-h-[72px]',
      isOver
        ? 'border-pmp-red bg-pmp-red/5'
        : 'border-pmp-gray-800 bg-pmp-gray-900'
    )}>
      {/* Tier label */}
      <div
        className="flex items-center justify-center w-14 shrink-0 border-r border-pmp-gray-800 cursor-pointer group"
        onClick={handleLabelClick}
        title="Click to rename"
      >
        {editing ? (
          <input
            ref={inputRef}
            value={labelValue}
            onChange={e => setLabelValue(e.target.value)}
            onBlur={handleLabelBlur}
            onKeyDown={handleLabelKeyDown}
            className="w-10 text-center bg-transparent border-b border-pmp-red text-pmp-white font-display font-bold text-xl focus:outline-none"
            maxLength={10}
            aria-label="Rename tier"
          />
        ) : (
          <span
            className="font-display font-bold text-xl select-none"
            style={{ color: getTierLabelColor(tier.label) }}
          >
            {tier.label}
          </span>
        )}
      </div>

      {/* Drop zone + cards */}
      <SortableContext
        items={tier.playerIds}
        strategy={horizontalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className="flex items-center gap-2 px-3 py-2 overflow-x-auto flex-1 min-w-0 scrollbar-hide"
          role="group"
          aria-label={`Tier ${tier.label} — ${tierPlayers.length} players`}
        >
          {tierPlayers.length === 0 && (
            <p className="text-pmp-gray-600 text-xs italic select-none">
              Drop players here
            </p>
          )}
          {tierPlayers.map(player => (
            <PlayerCard
              key={player.id}
              player={player}
              draggableId={player.id}
              compact
            />
          ))}
        </div>
      </SortableContext>

      {/* Delete tier button */}
      <button
        onClick={() => onDelete(tier.id)}
        className="px-2 text-pmp-gray-600 hover:text-pmp-red transition-colors duration-200 shrink-0"
        aria-label={`Delete tier ${tier.label}`}
        title="Delete tier"
      >
        ✕
      </button>
    </div>
  )
}
