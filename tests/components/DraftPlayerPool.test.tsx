import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DraftPlayerPool } from '@/components/draft/DraftPlayerPool'
import type { Player } from '@/lib/data/types'

const PLAYERS: Player[] = [
  {
    id: '1',
    name: 'Patrick Mahomes',
    firstName: 'Patrick',
    lastName: 'Mahomes',
    position: 'QB',
    team: 'KC',
    searchRank: 1,
    byeWeek: 14,
    headshotUrl: '',
  },
  {
    id: '2',
    name: 'CMC',
    firstName: 'Christian',
    lastName: 'McCaffrey',
    position: 'RB',
    team: 'SF',
    searchRank: 2,
    byeWeek: 9,
    headshotUrl: '',
  },
  {
    id: '3',
    name: 'Justin Jefferson',
    firstName: 'Justin',
    lastName: 'Jefferson',
    position: 'WR',
    team: 'MIN',
    searchRank: 3,
    byeWeek: 6,
    headshotUrl: '',
  },
]

const PLAYER_MAP = new Map(PLAYERS.map(p => [p.id, p]))

const defaultProps = {
  availablePlayerIds: ['1', '2', '3'],
  playerMap: PLAYER_MAP,
  selectedPoolPlayerId: null,
  lockedPlayerIds: [],
  isUserTurn: false,
  onPickPlayer: vi.fn(),
  onSelectPlayer: vi.fn(),
  onToggleLock: vi.fn(),
}

describe('DraftPlayerPool', () => {
  it('renders all players by default', () => {
    render(<DraftPlayerPool {...defaultProps} />)
    expect(screen.getByText('Patrick Mahomes')).toBeDefined()
    expect(screen.getByText('CMC')).toBeDefined()
    expect(screen.getByText('Justin Jefferson')).toBeDefined()
  })

  it('renders filter tabs for ALL, QB, RB, WR, TE, K, DEF', () => {
    render(<DraftPlayerPool {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'ALL' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'QB' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'RB' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'WR' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'TE' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'K' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'DEF' })).toBeDefined()
  })

  it('filters by position when QB tab clicked', () => {
    render(<DraftPlayerPool {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'QB' }))
    expect(screen.getByText('Patrick Mahomes')).toBeDefined()
    expect(screen.queryByText('CMC')).toBeNull()
    expect(screen.queryByText('Justin Jefferson')).toBeNull()
  })

  it('filters by position when RB tab clicked', () => {
    render(<DraftPlayerPool {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'RB' }))
    expect(screen.queryByText('Patrick Mahomes')).toBeNull()
    expect(screen.getByText('CMC')).toBeDefined()
  })

  it('shows all players when ALL tab is clicked after filtering', () => {
    render(<DraftPlayerPool {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'QB' }))
    fireEvent.click(screen.getByRole('button', { name: 'ALL' }))
    expect(screen.getByText('Patrick Mahomes')).toBeDefined()
    expect(screen.getByText('CMC')).toBeDefined()
    expect(screen.getByText('Justin Jefferson')).toBeDefined()
  })

  it('calls onPickPlayer when isUserTurn and player clicked', () => {
    const onPickPlayer = vi.fn()
    render(
      <DraftPlayerPool
        {...defaultProps}
        isUserTurn={true}
        onPickPlayer={onPickPlayer}
      />
    )
    fireEvent.click(screen.getByText('Patrick Mahomes'))
    expect(onPickPlayer).toHaveBeenCalledWith('1')
  })

  it('calls onSelectPlayer when not user turn and player clicked', () => {
    const onSelectPlayer = vi.fn()
    render(
      <DraftPlayerPool
        {...defaultProps}
        availablePlayerIds={['1']}
        isUserTurn={false}
        onSelectPlayer={onSelectPlayer}
      />
    )
    fireEvent.click(screen.getByText('Patrick Mahomes'))
    expect(onSelectPlayer).toHaveBeenCalledWith('1')
  })

  it('toggles selection off when clicking already-selected player while not user turn', () => {
    const onSelectPlayer = vi.fn()
    render(
      <DraftPlayerPool
        {...defaultProps}
        availablePlayerIds={['1']}
        selectedPoolPlayerId="1"
        isUserTurn={false}
        onSelectPlayer={onSelectPlayer}
      />
    )
    fireEvent.click(screen.getByText('Patrick Mahomes'))
    expect(onSelectPlayer).toHaveBeenCalledWith(null)
  })

  it('does not call onPickPlayer when not user turn', () => {
    const onPickPlayer = vi.fn()
    render(
      <DraftPlayerPool
        {...defaultProps}
        isUserTurn={false}
        onPickPlayer={onPickPlayer}
      />
    )
    fireEvent.click(screen.getByText('Patrick Mahomes'))
    expect(onPickPlayer).not.toHaveBeenCalled()
  })

  it('calls onToggleLock when lock button clicked', () => {
    const onToggleLock = vi.fn()
    render(
      <DraftPlayerPool
        {...defaultProps}
        onToggleLock={onToggleLock}
      />
    )
    const lockButtons = screen.getAllByRole('button', { name: /lock player/i })
    fireEvent.click(lockButtons[0])
    expect(onToggleLock).toHaveBeenCalledWith('1')
  })

  it('does not call onSelectPlayer when lock button clicked (stopPropagation)', () => {
    const onSelectPlayer = vi.fn()
    render(
      <DraftPlayerPool
        {...defaultProps}
        isUserTurn={false}
        onSelectPlayer={onSelectPlayer}
      />
    )
    const lockButtons = screen.getAllByRole('button', { name: /lock player/i })
    fireEvent.click(lockButtons[0])
    expect(onSelectPlayer).not.toHaveBeenCalled()
  })

  it('shows lock icon for locked players', () => {
    render(
      <DraftPlayerPool
        {...defaultProps}
        lockedPlayerIds={['1']}
      />
    )
    expect(screen.getByRole('button', { name: 'Unlock player' })).toBeDefined()
  })

  it('shows bye week when available', () => {
    render(<DraftPlayerPool {...defaultProps} availablePlayerIds={['1']} />)
    expect(screen.getByText(/Bye 14/)).toBeDefined()
  })

  it('shows player position and team', () => {
    render(<DraftPlayerPool {...defaultProps} availablePlayerIds={['1']} />)
    // The subtitle shows "QB · KC · Bye 14" — use getAllByText since QB also appears in filter tab
    const qbEls = screen.getAllByText(/QB/)
    expect(qbEls.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/KC/)).toBeDefined()
  })

  it('renders empty list when filter matches no players', () => {
    render(<DraftPlayerPool {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'K' }))
    expect(screen.queryByText('Patrick Mahomes')).toBeNull()
    expect(screen.queryByText('CMC')).toBeNull()
  })

  it('only shows available players, not all players in map', () => {
    render(
      <DraftPlayerPool
        {...defaultProps}
        availablePlayerIds={['1', '2']}
      />
    )
    expect(screen.getByText('Patrick Mahomes')).toBeDefined()
    expect(screen.getByText('CMC')).toBeDefined()
    expect(screen.queryByText('Justin Jefferson')).toBeNull()
  })
})
