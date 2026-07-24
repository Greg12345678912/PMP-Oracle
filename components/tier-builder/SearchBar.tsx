'use client'
import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/Input'
import { analytics } from '@/lib/analytics/events'
import type { Player } from '@/lib/data/types'

interface SearchBarProps {
  players: Player[]
  onFilter: (filtered: Player[]) => void
}

function filterPlayers(players: Player[], query: string): Player[] {
  if (!query.trim()) return players
  const q = query.toLowerCase().trim()
  return players.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.team.toLowerCase().includes(q) ||
    p.position.toLowerCase().includes(q)
  )
}

export function SearchBar({ players, onFilter }: SearchBarProps) {
  const [query, setQuery] = useState('')

  const applyFilter = useCallback((q: string) => {
    onFilter(filterPlayers(players, q))
  }, [players, onFilter])

  useEffect(() => {
    applyFilter(query)
  }, [query, applyFilter])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    if (value.length === 3) {
      analytics.playerSearched(value) // track after 3 chars to avoid noise
    }
  }

  return (
    <div className="relative">
      <Input
        role="searchbox"
        type="search"
        placeholder="Search players, teams, or positions..."
        value={query}
        onChange={handleChange}
        aria-label="Search players"
      />
      {query && (
        <button
          onClick={() => setQuery('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-pmp-gray-500 hover:text-pmp-white text-sm"
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  )
}
