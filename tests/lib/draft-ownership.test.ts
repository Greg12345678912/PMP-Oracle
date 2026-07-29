import { describe, it, expect } from 'vitest'
import { buildInitialState } from '@/lib/draft/engine'
import { DEFAULT_LINEUP } from '@/lib/draft/types'

const BASE = {
  numTeams: 4, numRounds: 15 as const, userSlot: 1,
  scoring: 'ppr' as const, speed: 'fast' as const, lineup: DEFAULT_LINEUP,
}

describe('currentOwnerTeamSlot', () => {
  it('all picks start owned by their teamSlot', () => {
    const state = buildInitialState(BASE, [])
    expect(state.picks.every(p => p.currentOwnerTeamSlot === p.teamSlot)).toBe(true)
  })

  it('isUser is derived correctly for slot 1', () => {
    const state = buildInitialState(BASE, [])
    const userPick = state.picks[0]  // round 1, slot 1 = pick 1
    expect(userPick.currentOwnerTeamSlot === BASE.userSlot).toBe(true)
  })

  it('ownership map application changes currentOwnerTeamSlot', () => {
    const state = buildInitialState(BASE, [])
    const ownershipMap = new Map<string, number>([['1_1', 4], ['2_4', 1]])
    const updated = {
      ...state,
      picks: state.picks.map(p => {
        const key = `${p.round}_${p.teamSlot}`
        const owner = ownershipMap.get(key)
        return owner !== undefined ? { ...p, currentOwnerTeamSlot: owner } : p
      }),
    }
    const pick_1_1 = updated.picks.find(p => p.round === 1 && p.teamSlot === 1)
    const pick_2_4 = updated.picks.find(p => p.round === 2 && p.teamSlot === 4)
    expect(pick_1_1?.currentOwnerTeamSlot).toBe(4)
    expect(pick_2_4?.currentOwnerTeamSlot).toBe(1)
  })

  it('no pick has isUser field', () => {
    const state = buildInitialState(BASE, [])
    expect('isUser' in state.picks[0]).toBe(false)
  })
})
