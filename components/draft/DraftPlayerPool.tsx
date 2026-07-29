'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import type { Player } from '@/lib/data/types'

type PositionFilter = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF'

interface DraftPlayerPoolProps {
  players: Player[]
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
  players,
  availablePlayerIds,
  selectedPoolPlayerId,
  lockedPlayerIds,
  isUserTurn,
  onPickPlayer,
  onSelectPlayer,
  onToggleLock,
}: DraftPlayerPoolProps) {
  const [search, setSearch] = useState('')
  const [selectedPosition, setSelectedPosition] = useState<PositionFilter | null>(null)
  const [justPicked, setJustPicked] = useState(false)
  const prevIsUserTurnRef = useRef(isUserTurn)

  useEffect(() => {
    if (!isUserTurn && prevIsUserTurnRef.current) {
      setJustPicked(true)
      const t = setTimeout(() => setJustPicked(false), 400)
      return () => clearTimeout(t)
    }
    prevIsUserTurnRef.current = isUserTurn
  }, [isUserTurn])

  // ADP rank map: position in the original players array (1-indexed)
  const rankMap = useMemo(() => {
    const map = new Map<string, number>()
    players.forEach((p, i) => map.set(p.id, i + 1))
    return map
  }, [players])

  const visiblePlayers = useMemo(() => {
    return players
      .filter(p => availablePlayerIds.includes(p.id))
      .filter(p => !selectedPosition || p.position === selectedPosition)
      .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
  }, [players, availablePlayerIds, selectedPosition, search])

  const handlePlayerClick = (playerId: string) => {
    if (isUserTurn) {
      onPickPlayer(playerId)
    } else {
      onSelectPlayer(selectedPoolPlayerId === playerId ? null : playerId)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sticky search bar */}
      <div className="sticky top-0 z-10 bg-[#0d0d0d] px-3 pt-3 pb-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-pmp-gray-500 text-sm select-none">🔍</span>
          <input
            type="text"
            placeholder="Search players..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-10 pl-8 pr-3 bg-[#1e1e1e] border border-[#2a2a2a] rounded-lg text-pmp-white text-sm placeholder:text-pmp-gray-600 focus:outline-none focus:border-pmp-red/50 transition-colors"
          />
        </div>
      </div>

      {/* Pill position filters */}
      <div className="flex gap-1.5 flex-wrap px-3 pb-2">
        {(['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const).map(pos => (
          <button
            key={pos}
            onClick={() => setSelectedPosition(pos === 'ALL' ? null : pos)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              (pos === 'ALL' ? selectedPosition === null : selectedPosition === pos)
                ? 'bg-pmp-red text-white'
                : 'bg-[#1e1e1e] text-pmp-gray-400 hover:bg-[#2a2a2a] hover:text-pmp-gray-300'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Player list */}
      <div className={`flex-1 overflow-y-auto transition-opacity duration-300 ${justPicked ? 'opacity-50' : 'opacity-100'}`}>
        {visiblePlayers.map(player => {
          const isSelected = selectedPoolPlayerId === player.id
          const isLocked = lockedPlayerIds.includes(player.id)
          return (
            <div
              key={player.id}
              onClick={() => handlePlayerClick(player.id)}
              className={`flex items-center gap-2.5 px-3 py-2 hover:bg-[#1e1e1e] hover:border-l-2 hover:border-pmp-red transition-all duration-100 cursor-pointer group ${
                isSelected ? 'bg-pmp-red/10 border-l-2 border-pmp-red' : ''
              }`}
            >
              {/* ADP rank */}
              <span className="text-pmp-gray-600 text-[11px] w-5 text-right shrink-0 font-mono tabular-nums">
                {rankMap.get(player.id)}
              </span>

              {/* Headshot or initial fallback */}
              {player.headshotUrl ? (
                <img
                  src={player.headshotUrl}
                  alt={player.name}
                  className="w-9 h-9 rounded-full object-cover bg-[#2a2a2a] shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-[#2a2a2a] flex items-center justify-center shrink-0">
                  <span className="text-pmp-gray-500 text-xs font-bold">{player.name.charAt(0)}</span>
                </div>
              )}

              {/* Name + position/team/bye */}
              <div className="flex-1 min-w-0">
                <p className="text-pmp-white text-sm font-semibold truncate leading-tight group-hover:text-pmp-red transition-colors">
                  {player.name}
                </p>
                <p className="text-pmp-gray-500 text-xs">
                  {player.position} · {player.team}
                  {player.byeWeek != null ? ` · Bye ${player.byeWeek}` : ''}
                </p>
              </div>

              {/* Lock button */}
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
