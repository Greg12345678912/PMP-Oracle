import { describe, it, expect } from 'vitest'
import { buildInitialState, makePick, undoPick } from '@/lib/draft/engine'
import type { DraftSettings } from '@/lib/draft/types'

const settings: DraftSettings = {
  numTeams: 2, numRounds: 2, userSlot: 1, scoring: 'ppr', speed: 'instant',
}
const players = [
  { id: 'p1', name: 'Alpha', firstName: 'Alpha', lastName: '', team: 'KC', position: 'QB' as const, headshotUrl: '', searchRank: 1, byeWeek: null },
  { id: 'p2', name: 'Beta',  firstName: 'Beta',  lastName: '', team: 'SF', position: 'RB' as const, headshotUrl: '', searchRank: 2, byeWeek: null },
  { id: 'p3', name: 'Gamma', firstName: 'Gamma', lastName: '', team: 'DAL', position: 'WR' as const, headshotUrl: '', searchRank: 3, byeWeek: null },
  { id: 'p4', name: 'Delta', firstName: 'Delta', lastName: '', team: 'GB',  position: 'TE' as const, headshotUrl: '', searchRank: 4, byeWeek: null },
]

describe('buildInitialState', () => {
  it('sets version to 0', () => {
    const state = buildInitialState(settings, players)
    expect(state.version).toBe(0)
  })
})

describe('undoPick', () => {
  it('returns same state when no picks made', () => {
    const state = buildInitialState(settings, players)
    expect(undoPick(state)).toBe(state)
  })

  it('reverses the last pick', () => {
    const state = buildInitialState(settings, players)
    const after = makePick(state, 'p1')
    const undone = undoPick(after)
    expect(undone.currentPickIndex).toBe(0)
    expect(undone.picks[0].playerId).toBeNull()
    expect(undone.availablePlayerIds).toContain('p1')
  })

  it('restores available players in ADP order', () => {
    const state = buildInitialState(settings, players)
    const after = makePick(state, 'p1')
    const undone = undoPick(after)
    expect(undone.availablePlayerIds[0]).toBe('p1')
  })

  it('sets status to drafting', () => {
    const state = buildInitialState(settings, players)
    const after = { ...makePick(state, 'p1'), status: 'complete' as const }
    expect(undoPick(after).status).toBe('drafting')
  })
})
