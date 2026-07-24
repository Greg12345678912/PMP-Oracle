import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchBar } from '@/components/tier-builder/SearchBar'
import type { Player } from '@/lib/data/types'

const players: Player[] = [
  { id: '1', name: 'De\'Von Achane', firstName: 'De\'Von', lastName: 'Achane', team: 'MIA', position: 'RB', headshotUrl: '', searchRank: 1 },
  { id: '2', name: 'Bijan Robinson', firstName: 'Bijan', lastName: 'Robinson', team: 'ATL', position: 'RB', headshotUrl: '', searchRank: 2 },
  { id: '3', name: 'Jaylen Waddle', firstName: 'Jaylen', lastName: 'Waddle', team: 'MIA', position: 'WR', headshotUrl: '', searchRank: 10 },
]

describe('SearchBar', () => {
  it('calls onFilter with all players when query is empty', () => {
    const onFilter = vi.fn()
    render(<SearchBar players={players} onFilter={onFilter} />)
    expect(onFilter).toHaveBeenCalledWith(players)
  })

  it('filters by player name (case-insensitive)', () => {
    const onFilter = vi.fn()
    render(<SearchBar players={players} onFilter={onFilter} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ach' } })
    expect(onFilter).toHaveBeenLastCalledWith([players[0]])
  })

  it('filters by team abbreviation', () => {
    const onFilter = vi.fn()
    render(<SearchBar players={players} onFilter={onFilter} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'MIA' } })
    const lastCall = onFilter.mock.calls.at(-1)![0]
    expect(lastCall).toHaveLength(2)
    expect(lastCall.every((p: Player) => p.team === 'MIA')).toBe(true)
  })

  it('filters by position', () => {
    const onFilter = vi.fn()
    render(<SearchBar players={players} onFilter={onFilter} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'WR' } })
    const lastCall = onFilter.mock.calls.at(-1)![0]
    expect(lastCall).toHaveLength(1)
    expect(lastCall[0].position).toBe('WR')
  })
})
