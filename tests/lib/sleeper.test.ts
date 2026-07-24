import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SleeperProvider } from '@/lib/data/sleeper'

const mockSleeperResponse = {
  '123': {
    player_id: '123',
    full_name: 'Christian McCaffrey',
    first_name: 'Christian',
    last_name: 'McCaffrey',
    team: 'SF',
    position: 'RB',
    fantasy_positions: ['RB'],
    status: 'Active',
    search_rank: 1,
  },
  '456': {
    player_id: '456',
    full_name: 'Inactive Player',
    first_name: 'Inactive',
    last_name: 'Player',
    team: 'FA',
    position: 'RB',
    fantasy_positions: ['RB'],
    status: 'Inactive',
    search_rank: 5,
  },
  '789': {
    player_id: '789',
    full_name: 'Bijan Robinson',
    first_name: 'Bijan',
    last_name: 'Robinson',
    team: 'ATL',
    position: 'RB',
    fantasy_positions: ['RB'],
    status: 'Active',
    search_rank: 2,
  },
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => mockSleeperResponse,
  } as Response)
})

describe('SleeperProvider', () => {
  it('filters out inactive players', async () => {
    const provider = new SleeperProvider()
    const players = await provider.getPlayers('RB')
    expect(players.find(p => p.name === 'Inactive Player')).toBeUndefined()
  })

  it('returns players sorted by search_rank ascending', async () => {
    const provider = new SleeperProvider()
    const players = await provider.getPlayers('RB')
    expect(players[0].name).toBe('Christian McCaffrey')
    expect(players[1].name).toBe('Bijan Robinson')
  })

  it('generates correct headshot URL', async () => {
    const provider = new SleeperProvider()
    const players = await provider.getPlayers('RB')
    expect(players[0].headshotUrl).toBe('https://sleepercdn.com/content/nfl/players/thumb/123.jpg')
  })

  it('returns FLEX as combined RB/WR/TE players', async () => {
    const provider = new SleeperProvider()
    const players = await provider.getPlayers('FLEX')
    expect(players.every(p => ['RB', 'WR', 'TE'].includes(p.position))).toBe(true)
  })
})
