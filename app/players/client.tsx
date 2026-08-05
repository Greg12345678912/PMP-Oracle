'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { Player } from '@/lib/data/types'
import type { OraclePosition } from '@/lib/oracle/constants'

interface PlayersClientProps {
  playersByPosition: Record<OraclePosition, Player[]>
  isPostLock: boolean
}

const POSITIONS: OraclePosition[] = ['QB', 'RB', 'WR', 'TE']

const POSITION_COLORS: Record<OraclePosition, string> = {
  QB: 'text-red-400',
  RB: 'text-green-400',
  WR: 'text-blue-400',
  TE: 'text-yellow-400',
}

function PlayerCard({ player }: { player: Player }) {
  return (
    <Link
      href={`/players/${player.id}`}
      className="flex items-center gap-3 bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-4 py-3 hover:border-pmp-gray-600 transition-colors"
    >
      <div className="w-10 h-10 rounded-full bg-pmp-gray-800 overflow-hidden shrink-0 flex items-center justify-center">
        {player.headshotUrl ? (
          <img src={player.headshotUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-pmp-gray-600 text-xs font-bold">{player.lastName[0]}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-pmp-white text-sm font-semibold truncate">{player.name}</p>
        <p className="text-pmp-gray-600 text-xs">{player.team}</p>
      </div>
      <span className={['text-xs font-bold', POSITION_COLORS[player.position as OraclePosition] ?? 'text-pmp-gray-500'].join(' ')}>
        {player.position}
      </span>
    </Link>
  )
}

export function PlayersClient({ playersByPosition, isPostLock }: PlayersClientProps) {
  const [query, setQuery] = useState('')
  const [activePos, setActivePos] = useState<OraclePosition | 'ALL'>('ALL')

  const allPlayers = useMemo(
    () => POSITIONS.flatMap(pos => playersByPosition[pos] ?? []),
    [playersByPosition],
  )

  /* Top picks across all positions — top 3 per position by ADP rank */
  const topPicks = useMemo(
    () => POSITIONS.flatMap(pos => (playersByPosition[pos] ?? []).slice(0, 3)),
    [playersByPosition],
  )

  const filtered = useMemo(() => {
    const pool = activePos === 'ALL' ? allPlayers : (playersByPosition[activePos] ?? [])
    if (!query.trim()) return pool
    const q = query.toLowerCase()
    return pool.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.team.toLowerCase().includes(q),
    )
  }, [allPlayers, playersByPosition, activePos, query])

  const showSearch = query.trim().length > 0

  return (
    <div className="flex flex-col gap-0">
      {/* Search bar */}
      <div className="px-4 pt-5 pb-4 border-b border-pmp-gray-800">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-pmp-gray-600 text-sm">🔍</span>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search players..."
            className="w-full bg-pmp-gray-900 border border-pmp-gray-800 text-pmp-white placeholder-pmp-gray-600 rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-pmp-red transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-pmp-gray-600 hover:text-pmp-gray-400 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Search results */}
      {showSearch ? (
        <div className="px-4 pt-4 flex flex-col gap-2">
          <p className="text-pmp-gray-600 text-xs font-bold uppercase tracking-widest mb-1">
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </p>
          {filtered.length === 0 ? (
            <p className="text-pmp-gray-600 text-sm text-center py-8">No players found</p>
          ) : (
            filtered.map(p => <PlayerCard key={p.id} player={p} />)
          )}
        </div>
      ) : (
        <>
          {/* Community insight banner */}
          {!isPostLock ? (
            <div className="mx-4 mt-4 bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-lg">🔒</span>
              <div>
                <p className="text-pmp-white text-sm font-semibold">Community opinions unlock Sep 9</p>
                <p className="text-pmp-gray-600 text-xs">Trending, divisive picks, and consensus rankings reveal after lock</p>
              </div>
            </div>
          ) : (
            <div className="mx-4 mt-4 bg-pmp-gray-900 border border-pmp-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-lg">⏳</span>
              <div>
                <p className="text-pmp-white text-sm font-semibold">Rankings are locked</p>
                <p className="text-pmp-gray-600 text-xs">Community consensus and trending picks unlock after Week 1 scoring</p>
              </div>
            </div>
          )}

          {/* Most Ranked section */}
          <div className="px-4 pt-6">
            <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest mb-3">
              {isPostLock ? 'Most Ranked' : 'Consensus Top Picks'}
            </p>
            <div className="flex flex-col gap-2">
              {topPicks.map(p => <PlayerCard key={p.id} player={p} />)}
            </div>
          </div>

          {/* Divider + browse by position */}
          <div className="px-4 pt-6">
            <p className="text-pmp-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Browse by Position</p>

            {/* Position tabs */}
            <div className="flex gap-2 mb-4">
              {(['ALL', ...POSITIONS] as const).map(pos => (
                <button
                  key={pos}
                  onClick={() => setActivePos(pos)}
                  className={[
                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                    activePos === pos
                      ? 'bg-pmp-red text-pmp-white'
                      : 'bg-pmp-gray-900 text-pmp-gray-500 border border-pmp-gray-800 hover:border-pmp-gray-600',
                  ].join(' ')}
                >
                  {pos}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 pb-4">
              {(activePos === 'ALL' ? allPlayers : (playersByPosition[activePos] ?? [])).map(p => (
                <PlayerCard key={p.id} player={p} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
