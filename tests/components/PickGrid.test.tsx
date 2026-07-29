import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PickGrid } from '@/components/draft/PickGrid'
import type { PickSlot } from '@/lib/draft/types'
import type { Player } from '@/lib/data/types'

const PICKS: PickSlot[] = [
  { overallPick: 1, round: 1, pickInRound: 1, teamSlot: 1, isUser: false, playerId: 'p1' },
  { overallPick: 2, round: 1, pickInRound: 2, teamSlot: 2, isUser: true, playerId: 'p2' },
  { overallPick: 3, round: 1, pickInRound: 3, teamSlot: 3, isUser: false, playerId: null },
]

const PLAYER_MAP = new Map<string, Player>([
  ['p1', { id: 'p1', name: 'Alpha RB', firstName: 'Alpha', lastName: 'RB', position: 'RB', team: 'KC', searchRank: 1, byeWeek: 7, headshotUrl: '' }],
  ['p2', { id: 'p2', name: 'Beta QB', firstName: 'Beta', lastName: 'QB', position: 'QB', team: 'DAL', searchRank: 2, byeWeek: 9, headshotUrl: '' }],
])

describe('PickGrid', () => {
  it('renders player names in completed slots', () => {
    render(
      <PickGrid
        picks={PICKS}
        playerMap={PLAYER_MAP}
        currentPickIndex={2}
        selectedPoolPlayerId={null}
        onAssign={vi.fn()}
        onSelectCell={vi.fn()}
        numTeams={3}
      />
    )
    expect(screen.getByText('Alpha RB')).toBeDefined()
    expect(screen.getByText('Beta QB')).toBeDefined()
  })

  it('shows empty state for unpicked slots', () => {
    render(
      <PickGrid
        picks={PICKS}
        playerMap={PLAYER_MAP}
        currentPickIndex={2}
        selectedPoolPlayerId={null}
        onAssign={vi.fn()}
        onSelectCell={vi.fn()}
        numTeams={3}
      />
    )
    // Pick 3 has no player — should show round.pick label
    expect(screen.getByText('1.03')).toBeDefined()
  })

  it('calls onAssign when clicking a completed slot with selectedPoolPlayerId set', () => {
    const onAssign = vi.fn()
    render(
      <PickGrid
        picks={PICKS}
        playerMap={PLAYER_MAP}
        currentPickIndex={2}
        selectedPoolPlayerId="p99"
        onAssign={onAssign}
        onSelectCell={vi.fn()}
        numTeams={3}
      />
    )
    // Click pick 0 (completed)
    fireEvent.click(screen.getByText('Alpha RB'))
    expect(onAssign).toHaveBeenCalledWith(0, 'p99')
  })
})
