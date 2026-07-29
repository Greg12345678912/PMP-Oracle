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
  players: PLAYERS,
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

  it('renders a search input', () => {
    render(<DraftPlayerPool {...defaultProps} />)
    expect(screen.getByPlaceholderText('Search players...')).toBeDefined()
  })

  it('filters players by search text', () => {
    render(<DraftPlayerPool {...defaultProps} />)
    const searchInput = screen.getByPlaceholderText('Search players...')
    fireEvent.change(searchInput, { target: { value: 'mahomes' } })
    expect(screen.getByText('Patrick Mahomes')).toBeDefined()
    expect(screen.queryByText('CMC')).toBeNull()
    expect(screen.queryByText('Justin Jefferson')).toBeNull()
  })

  it('search is case-insensitive', () => {
    render(<DraftPlayerPool {...defaultProps} />)
    const searchInput = screen.getByPlaceholderText('Search players...')
    fireEvent.change(searchInput, { target: { value: 'JEFFERSON' } })
    expect(screen.getByText('Justin Jefferson')).toBeDefined()
    expect(screen.queryByText('Patrick Mahomes')).toBeNull()
  })

  it('shows no players when search matches nothing', () => {
    render(<DraftPlayerPool {...defaultProps} />)
    const searchInput = screen.getByPlaceholderText('Search players...')
    fireEvent.change(searchInput, { target: { value: 'xyzzy' } })
    expect(screen.queryByText('Patrick Mahomes')).toBeNull()
    expect(screen.queryByText('CMC')).toBeNull()
    expect(screen.queryByText('Justin Jefferson')).toBeNull()
  })

  it('displays ADP rank numbers for each player', () => {
    render(<DraftPlayerPool {...defaultProps} />)
    // Players are in ADP order: Mahomes=1, CMC=2, Jefferson=3
    expect(screen.getByText('1')).toBeDefined()
    expect(screen.getByText('2')).toBeDefined()
    expect(screen.getByText('3')).toBeDefined()
  })

  it('shows player initial as fallback when headshotUrl is empty', () => {
    render(<DraftPlayerPool {...defaultProps} availablePlayerIds={['1']} />)
    // headshotUrl is '' so we expect the initial 'P' for Patrick Mahomes
    expect(screen.getByText('P')).toBeDefined()
  })

  it('shows headshot img when headshotUrl is provided', () => {
    const playersWithHeadshot: Player[] = [
      { ...PLAYERS[0], headshotUrl: 'https://example.com/mahomes.jpg' },
    ]
    render(
      <DraftPlayerPool
        {...defaultProps}
        players={playersWithHeadshot}
        playerMap={new Map(playersWithHeadshot.map(p => [p.id, p]))}
        availablePlayerIds={['1']}
      />
    )
    const img = screen.getByRole('img', { name: 'Patrick Mahomes' })
    expect(img).toBeDefined()
  })

  it('ADP rank is based on position in players array, not filtered position', () => {
    // Players array: [QB(rank1), RB(rank2), WR(rank3)]
    // When filtered to WR only, Jefferson should still show rank 3
    render(<DraftPlayerPool {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'WR' }))
    // Jefferson is rank 3 in the ADP-sorted array
    expect(screen.getByText('Justin Jefferson')).toBeDefined()
    expect(screen.getByText('3')).toBeDefined()
  })
})
