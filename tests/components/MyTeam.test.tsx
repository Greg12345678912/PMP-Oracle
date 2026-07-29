import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MyTeam } from '@/components/draft/MyTeam'
import type { PickSlot } from '@/lib/draft/types'
import type { Player } from '@/lib/data/types'

const USER_PICKS: PickSlot[] = [
  { overallPick: 3, round: 1, pickInRound: 3, teamSlot: 3, isUser: true, playerId: 'p1' },
  { overallPick: 18, round: 2, pickInRound: 3, teamSlot: 3, isUser: true, playerId: null },
]

const PLAYER_MAP = new Map<string, Player>([
  ['p1', {
    id: 'p1',
    name: 'Christian McCaffrey',
    firstName: 'Christian',
    lastName: 'McCaffrey',
    position: 'RB',
    team: 'SF',
    searchRank: 1,
    byeWeek: 9,
    headshotUrl: ''
  }],
])

describe('MyTeam', () => {
  it('shows drafted player name', () => {
    render(<MyTeam picks={USER_PICKS} playerMap={PLAYER_MAP} numRounds={15} />)
    expect(screen.getByText('Christian McCaffrey')).toBeDefined()
  })

  it('shows player position and team', () => {
    render(<MyTeam picks={USER_PICKS} playerMap={PLAYER_MAP} numRounds={15} />)
    expect(screen.getByText(/RB/)).toBeDefined()
    expect(screen.getByText(/SF/)).toBeDefined()
  })

  it('shows round placeholder for empty slots', () => {
    render(<MyTeam picks={USER_PICKS} playerMap={PLAYER_MAP} numRounds={15} />)
    expect(screen.getByText('Round 2')).toBeDefined()
  })

  it('only shows user picks', () => {
    const mixed: PickSlot[] = [
      ...USER_PICKS,
      { overallPick: 1, round: 1, pickInRound: 1, teamSlot: 1, isUser: false, playerId: 'p2' },
    ]
    const extendedPlayerMap = new Map(PLAYER_MAP)
    extendedPlayerMap.set('p2', {
      id: 'p2',
      name: 'CPU Player',
      firstName: 'CPU',
      lastName: 'Player',
      position: 'QB',
      team: 'DAL',
      searchRank: 2,
      byeWeek: 8,
      headshotUrl: ''
    })
    render(<MyTeam picks={mixed} playerMap={extendedPlayerMap} numRounds={15} />)
    // Should not see CPU Player (isUser: false)
    expect(screen.queryByText('CPU Player')).toBeNull()
    // Should only see the 2 user picks
    expect(screen.getByText('Christian McCaffrey')).toBeDefined()
    expect(screen.getByText('Round 2')).toBeDefined()
  })
})
