import { describe, it, expect, vi } from 'vitest'

// Mock fetch: first call is Sleeper (/v1/players/nfl), second is FantasyCalc
function mockFetch(sleeperData: object, fcData: object[] = []) {
  let callCount = 0
  global.fetch = vi.fn().mockImplementation(async (url: string) => {
    if (String(url).includes('fantasycalc')) {
      return { ok: true, json: async () => fcData } as Response
    }
    return { ok: true, json: async () => sleeperData } as Response
  })
  return callCount
}

describe('getDraftPlayers', () => {
  it('returns players with byeWeek field', async () => {
    const { SleeperProvider } = await import('@/lib/data/sleeper')
    const provider = new SleeperProvider()
    mockFetch({
      '1': { player_id: '1', full_name: 'Patrick Mahomes', position: 'QB', team: 'KC', search_rank: 1, bye_week: 14 },
      '2': { player_id: '2', full_name: 'Justin Tucker', position: 'K', team: 'BAL', search_rank: 250, bye_week: 9 },
      '3': { player_id: '3', full_name: 'SF Defense', position: 'DEF', team: 'SF', search_rank: 300, bye_week: 9 },
    })
    const players = await provider.getDraftPlayers('ppr')
    expect(players.length).toBeGreaterThan(0)
    expect(players[0]).toHaveProperty('byeWeek')
    const kPlayers = players.filter(p => p.position === 'K')
    const defPlayers = players.filter(p => p.position === 'DEF')
    expect(kPlayers.length).toBeGreaterThan(0)
    expect(defPlayers.length).toBeGreaterThan(0)
  })

  it('falls back to search_rank order when FantasyCalc unavailable', async () => {
    const { SleeperProvider } = await import('@/lib/data/sleeper')
    const provider = new SleeperProvider()
    mockFetch(
      {
        '1': { player_id: '1', full_name: 'Alpha', position: 'QB', team: 'KC', search_rank: 5, bye_week: 7 },
        '2': { player_id: '2', full_name: 'Beta', position: 'RB', team: 'DAL', search_rank: 2, bye_week: 7 },
      },
      [], // empty FantasyCalc → falls back to search_rank
    )
    const players = await provider.getDraftPlayers('ppr')
    // Beta (search_rank=2) should come first
    expect(players[0].name).toBe('Beta')
    expect(players[1].name).toBe('Alpha')
  })

  it('uses FantasyCalc overallRank over search_rank when available', async () => {
    const { SleeperProvider } = await import('@/lib/data/sleeper')
    const provider = new SleeperProvider()
    mockFetch(
      {
        // Alpha QB: search_rank=1 (most searched) but FC ranks it 24th
        '1': { player_id: '1', full_name: 'Alpha QB', position: 'QB', team: 'KC', search_rank: 1, bye_week: 7 },
        // Beta RB: search_rank=50 but FC ranks it 3rd
        '2': { player_id: '2', full_name: 'Beta RB', position: 'RB', team: 'DAL', search_rank: 50, bye_week: 7 },
      },
      [
        { player: { sleeperId: '2', name: 'Beta RB', position: 'RB' }, overallRank: 3 },
        { player: { sleeperId: '1', name: 'Alpha QB', position: 'QB' }, overallRank: 24 },
      ],
    )
    const players = await provider.getDraftPlayers('ppr')
    // Beta should come first because FC overallRank 3 < 24 (not search_rank order)
    expect(players[0].name).toBe('Beta RB')
    expect(players[1].name).toBe('Alpha QB')
  })
})
