'use client'
import { useState } from 'react'
import type { Player } from '@/lib/data/types'

type PositionFilter = 'ALL' | 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF'
const FILTERS: PositionFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF']

interface DraftPlayerPoolProps {
  availablePlayerIds: string[]
  playerMap: Map<string, Player>
  selectedPoolPlayerId: string | null
  lockedPlayerIds: string[]
  isUserTurn: boolean
  onPickPlayer: (playerId: string) => void
  onSelectPlayer: (playerId: string | null) => void
  onToggleLock: (playerId: string) => void
}

export function DraftPlayerPool({
  availablePlayerIds,
  playerMap,
  selectedPoolPlayerId,
  lockedPlayerIds,
  isUserTurn,
  onPickPlayer,
  onSelectPlayer,
  onToggleLock,
}: DraftPlayerPoolProps) {
  const [filter, setFilter] = useState<PositionFilter>('ALL')

  const visible = availablePlayerIds
    .map(id => playerMap.get(id))
    .filter((p): p is Player => !!p && (filter === 'ALL' || p.position === filter))

  const handlePlayerClick = (playerId: string) => {
    if (isUserTurn) {
      onPickPlayer(playerId)
    } else {
      onSelectPlayer(selectedPoolPlayerId === playerId ? null : playerId)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filter tabs */}
      <div className="flex gap-1 px-2 py-2 border-b border-pmp-gray-800 overflow-x-auto">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-1 rounded text-xs font-bold shrink-0 transition-colors ${
              filter === f
                ? 'bg-pmp-red text-pmp-white'
                : 'text-pmp-gray-500 hover:text-pmp-white'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Player list */}
      <div className="flex-1 overflow-y-auto">
        {visible.map((player, idx) => {
          const isSelected = selectedPoolPlayerId === player.id
          const isLocked = lockedPlayerIds.includes(player.id)
          return (
            <div
              key={player.id}
              onClick={() => handlePlayerClick(player.id)}
              className={`flex items-center gap-3 px-3 py-2.5 border-b border-pmp-gray-800 cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-pmp-red/10 border-l-2 border-l-pmp-red'
                  : 'hover:bg-pmp-gray-900'
              }`}
            >
              <span className="text-pmp-gray-600 text-xs w-5 text-right">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-pmp-white truncate">
                  {player.name}
                </p>
                <p className="text-pmp-gray-500 text-xs">
                  {player.position} &middot; {player.team}
                  {player.byeWeek != null ? ` · Bye ${player.byeWeek}` : ''}
                </p>
              </div>
              <button
                onClick={e => {
                  e.stopPropagation()
                  onToggleLock(player.id)
                }}
                className={`text-xs px-1 shrink-0 ${
                  isLocked
                    ? 'text-pmp-red'
                    : 'text-pmp-gray-700 hover:text-pmp-gray-500'
                }`}
                aria-label={isLocked ? 'Unlock player' : 'Lock player'}
              >
                {isLocked ? '🔒' : '○'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
