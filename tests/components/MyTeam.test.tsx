import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MyTeam } from '@/components/draft/MyTeam'
import { buildRosterSlots } from '@/lib/draft/lineup'
import { DEFAULT_LINEUP } from '@/lib/draft/types'
import type { PickSlot } from '@/lib/draft/types'
import type { Player } from '@/lib/data/types'

// Inline copy of assignToRoster for testing the pure algorithm
function assignToRoster(
  userPicks: { player: Player; pick: PickSlot }[],
  slots: ReturnType<typeof buildRosterSlots>
) {
  const used = new Set<number>()
  return slots.map(slot => {
    const match = userPicks.find(
      up => !used.has(up.pick.overallPick) && slot.positions.includes(up.player.position)
    )
    if (match) used.add(match.pick.overallPick)
    return match ?? null
  })
}

const mockPlayer = (id: string, name: string, pos: string): Player => ({
  id, name, position: pos, team: 'BUF', searchRank: 1, byeWeek: 7,
  headshotUrl: '', firstName: name.split(' ')[0], lastName: name.split(' ')[1] ?? ''
})
const mockPick = (overall: number, round: number, slot: number): PickSlot => ({
  overallPick: overall, round, pickInRound: slot, teamSlot: 1, isUser: true, playerId: null
})

describe('assignToRoster', () => {
  const slots = buildRosterSlots(DEFAULT_LINEUP)

  it('assigns QB to QB slot', () => {
    const picks = [{ player: mockPlayer('1', 'Josh Allen', 'QB'), pick: mockPick(1, 1, 1) }]
    const result = assignToRoster(picks, slots)
    expect(result[0]?.player.name).toBe('Josh Allen')
    expect(result[1]).toBeNull()
  })

  it('puts 2nd QB into BN', () => {
    const picks = [
      { player: mockPlayer('1', 'Josh Allen', 'QB'), pick: mockPick(1, 1, 1) },
      { player: mockPlayer('2', 'Joe Burrow', 'QB'), pick: mockPick(20, 2, 1) },
    ]
    const result = assignToRoster(picks, slots)
    expect(result[0]?.player.name).toBe('Josh Allen')
    const bnAssigned = result.slice(9).some(r => r?.player.name === 'Joe Burrow')
    expect(bnAssigned).toBe(true)
  })

  it('WR fills FLEX before BN when WR slots exhausted', () => {
    const picks = [
      { player: mockPlayer('1', 'WR1', 'WR'), pick: mockPick(1, 1, 1) },
      { player: mockPlayer('2', 'WR2', 'WR'), pick: mockPick(2, 1, 2) },
      { player: mockPlayer('3', 'WR3', 'WR'), pick: mockPick(3, 1, 3) },
      { player: mockPlayer('4', 'WR4', 'WR'), pick: mockPick(4, 1, 4) },
    ]
    const result = assignToRoster(picks, slots)
    // DEFAULT_LINEUP: QB(0) RB(0) WR(1) WR(2) WR(3) TE FLEX K DEF BN...
    // WR1,WR2,WR3 fill 3 WR slots; WR4 should fill FLEX (index 6)
    const flexIdx = slots.findIndex(s => s.label === 'FLEX')
    expect(result[flexIdx]?.player.name).toBe('WR4')
  })
})

// ---- React rendering tests ----

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

describe('MyTeam (render)', () => {
  it('shows drafted player name', () => {
    render(<MyTeam picks={USER_PICKS} playerMap={PLAYER_MAP} lineup={DEFAULT_LINEUP} />)
    expect(screen.getByText('Christian McCaffrey')).toBeDefined()
  })

  it('shows player team in the rendered row', () => {
    render(<MyTeam picks={USER_PICKS} playerMap={PLAYER_MAP} lineup={DEFAULT_LINEUP} />)
    expect(screen.getByText('SF')).toBeDefined()
  })

  it('shows slot labels from lineup', () => {
    render(<MyTeam picks={USER_PICKS} playerMap={PLAYER_MAP} lineup={DEFAULT_LINEUP} />)
    // QB slot label should appear
    expect(screen.getByText('QB')).toBeDefined()
  })

  it('shows empty dash for unfilled slots', () => {
    render(<MyTeam picks={USER_PICKS} playerMap={PLAYER_MAP} lineup={DEFAULT_LINEUP} />)
    // Empty slots render with "—"
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThan(0)
  })

  it('only shows user picks (not CPU picks)', () => {
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
    render(<MyTeam picks={mixed} playerMap={extendedPlayerMap} lineup={DEFAULT_LINEUP} />)
    // Should not see CPU Player (isUser: false)
    expect(screen.queryByText('CPU Player')).toBeNull()
    // Should see the user's drafted player
    expect(screen.getByText('Christian McCaffrey')).toBeDefined()
  })
})
