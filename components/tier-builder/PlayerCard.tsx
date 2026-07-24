'use client'
import Image from 'next/image'
import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { getTeamColor } from '@/lib/team-colors'
import { PlayerCardSkeleton } from '@/components/ui/Skeleton'
import type { Player } from '@/lib/data/types'

interface PlayerCardProps {
  player: Player
  draggableId: string
  compact?: boolean // smaller size for tier rows vs pool
}

export function PlayerCard({ player, draggableId, compact = false }: PlayerCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draggableId,
    data: { playerId: player.id },
  })
  const [imageLoaded, setImageLoaded] = useState(false)

  const style = {
    transform: CSS.Translate.toString(transform),
  }

  const teamColor = getTeamColor(player.team)

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'relative flex flex-col items-center rounded-lg bg-pmp-gray-900 border border-pmp-gray-800 cursor-grab active:cursor-grabbing select-none shrink-0 transition-all duration-200',
        'hover:border-pmp-gray-600 hover:scale-105',
        isDragging && 'opacity-50 scale-105 z-50 shadow-2xl',
        compact ? 'w-16 p-1.5' : 'w-20 p-2',
      )}
      role="button"
      aria-label={`${player.name}, ${player.team}, ${player.position}`}
    >
      {/* Team color accent strip */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 rounded-t-lg"
        style={{ backgroundColor: teamColor }}
      />

      {/* Headshot */}
      <div className={cn('relative', compact ? 'w-10 h-10' : 'w-12 h-12')}>
        {!imageLoaded && <PlayerCardSkeleton />}
        <Image
          src={player.headshotUrl}
          alt={player.name}
          fill
          className={cn(
            'object-contain transition-opacity duration-300',
            imageLoaded ? 'opacity-100' : 'opacity-0',
          )}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageLoaded(true)} // show nothing on error, don't break
          sizes={compact ? '40px' : '48px'}
          unoptimized // Sleeper CDN handles its own optimization
        />
      </div>

      {/* Name */}
      <p
        className={cn(
          'text-pmp-white font-medium leading-tight text-center mt-1 truncate w-full',
          compact ? 'text-[10px]' : 'text-xs',
        )}
      >
        {player.lastName}
      </p>

      {/* Team • Position */}
      <p
        className={cn(
          'text-pmp-gray-500 leading-tight text-center',
          compact ? 'text-[9px]' : 'text-[10px]',
        )}
      >
        {player.team} • {player.position}
      </p>
    </div>
  )
}
