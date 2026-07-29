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
    const players = await provider.getDraftPlayers('ppr')
    expect(players.length).toBeGreaterThan(0)
    expect(players[0]).toHaveProperty('byeWeek')
    const kPlayers = players.filter(p => p.position === 'K')
    const defPlayers = players.filter(p => p.position === 'DEF')
    expect(kPlayers.length).toBeGreaterThan(0)
    expect(defPlayers.length).toBeGreaterThan(0)
  })

  it('sorts players by searchRank ascending (search_rank fallback)', async () => {
    const { SleeperProvider } = await import('@/lib/data/sleeper')
    const provider = new SleeperProvider()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        '1': { player_id: '1', full_name: 'Alpha', position: 'QB', team: 'KC', search_rank: 5, bye_week: 7 },
        '2': { player_id: '2', full_name: 'Beta', position: 'RB', team: 'DAL', search_rank: 2, bye_week: 7 },
      }),
    } as Response)
    const players = await provider.getDraftPlayers('ppr')
    expect(players[0].searchRank).toBeLessThan(players[1].searchRank)
  })

  it('prefers adp_ppr over search_rank when available', async () => {
    const { SleeperProvider } = await import('@/lib/data/sleeper')
    const provider = new SleeperProvider()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        // Alpha has search_rank=1 (most searched) but high adp_ppr=24 (late pick)
        '1': { player_id: '1', full_name: 'Alpha QB', position: 'QB', team: 'KC', search_rank: 1, adp_ppr: 24, bye_week: 7 },
        // Beta has search_rank=50 but low adp_ppr=3 (early pick)
        '2': { player_id: '2', full_name: 'Beta RB', position: 'RB', team: 'DAL', search_rank: 50, adp_ppr: 3, bye_week: 7 },
      }),
    } as Response)
    const players = await provider.getDraftPlayers('ppr')
    // Beta should come first because adp_ppr=3 < adp_ppr=24 (not search_rank)
    expect(players[0].name).toBe('Beta RB')
    expect(players[1].name).toBe('Alpha QB')
  })
})
