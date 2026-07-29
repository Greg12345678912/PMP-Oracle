import { describe, it, expect, vi } from 'vitest'

describe('getDraftPlayers', () => {
  it('returns players with byeWeek field', async () => {
    const { SleeperProvider } = await import('@/lib/data/sleeper')
    const provider = new SleeperProvider()
    // mock fetch to avoid network
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        '1': { player_id: '1', full_name: 'Patrick Mahomes', position: 'QB', team: 'KC', search_rank: 1, bye_week: 14 },
        '2': { player_id: '2', full_name: 'Justin Tucker', position: 'K', team: 'BAL', search_rank: 250, bye_week: 9 },
        '3': { player_id: '3', full_name: 'SF Defense', position: 'DEF', team: 'SF', search_rank: 300, bye_week: 9 },
      }),
    } as Response)
    const players = await provider.getDraftPlayers()
    expect(players.length).toBeGreaterThan(0)
    expect(players[0]).toHaveProperty('byeWeek')
    const kPlayers = players.filter(p => p.position === 'K')
    const defPlayers = players.filter(p => p.position === 'DEF')
    expect(kPlayers.length).toBeGreaterThan(0)
    expect(defPlayers.length).toBeGreaterThan(0)
  })

  it('sorts players by searchRank ascending', async () => {
    const { SleeperProvider } = await import('@/lib/data/sleeper')
    const provider = new SleeperProvider()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        '1': { player_id: '1', full_name: 'Alpha', position: 'QB', team: 'KC', search_rank: 5, bye_week: 7 },
        '2': { player_id: '2', full_name: 'Beta', position: 'RB', team: 'DAL', search_rank: 2, bye_week: 7 },
      }),
    } as Response)
    const players = await provider.getDraftPlayers()
    expect(players[0].searchRank).toBeLessThan(players[1].searchRank)
  })
})
