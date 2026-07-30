import { describe, it, expect } from 'vitest'
import { DraftService, generateInviteCode } from '@/lib/league/service'
import { buildInitialState } from '@/lib/draft/engine'
import type { DraftSettings } from '@/lib/draft/types'
import type { LeagueMember } from '@/lib/league/types'

const settings: DraftSettings = {
  numTeams: 2, numRounds: 2, userSlot: 1, scoring: 'ppr', speed: 'instant',
}
const players = [
  { id: 'p1', name: 'A', firstName: 'A', lastName: '', team: 'KC', position: 'QB' as const, headshotUrl: '', searchRank: 1, byeWeek: null },
  { id: 'p2', name: 'B', firstName: 'B', lastName: '', team: 'SF', position: 'RB' as const, headshotUrl: '', searchRank: 2, byeWeek: null },
  { id: 'p3', name: 'C', firstName: 'C', lastName: '', team: 'DAL', position: 'WR' as const, headshotUrl: '', searchRank: 3, byeWeek: null },
  { id: 'p4', name: 'D', firstName: 'D', lastName: '', team: 'GB',  position: 'TE' as const, headshotUrl: '', searchRank: 4, byeWeek: null },
]

const baseMembers: LeagueMember[] = [
  { id: 'a', leagueId: 'l1', userId: 'u1', displayName: 'Alice', teamSlot: 1, isReady: true, joinedAt: '' },
  { id: 'b', leagueId: 'l1', userId: 'u2', displayName: 'Bob',   teamSlot: 2, isReady: true, joinedAt: '' },
]

describe('generateInviteCode', () => {
  it('returns 6 uppercase alphanumeric characters', () => {
    const code = generateInviteCode()
    expect(code).toHaveLength(6)
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  })
})

describe('DraftService.validatePick', () => {
  const state = buildInitialState(settings, players)

  it('returns ok when pick is valid', () => {
    const result = DraftService.validatePick({
      state, playerId: 'p1', userId: 'u1',
      members: baseMembers, leagueStatus: 'drafting',
    })
    expect(result.ok).toBe(true)
  })

  it('rejects when league is not drafting', () => {
    const result = DraftService.validatePick({
      state, playerId: 'p1', userId: 'u1',
      members: baseMembers, leagueStatus: 'lobby',
    })
    expect(result.ok).toBe(false)
    expect((result as { status: number }).status).toBe(403)
  })

  it('rejects when not the user turn', () => {
    const result = DraftService.validatePick({
      state, playerId: 'p1', userId: 'u2',  // u2 is slot 2, but pick 1 belongs to slot 1
      members: baseMembers, leagueStatus: 'drafting',
    })
    expect(result.ok).toBe(false)
    expect((result as { status: number }).status).toBe(403)
  })

  it('rejects unavailable player', () => {
    const result = DraftService.validatePick({
      state, playerId: 'p_gone', userId: 'u1',
      members: baseMembers, leagueStatus: 'drafting',
    })
    expect(result.ok).toBe(false)
    expect((result as { status: number }).status).toBe(409)
  })
})

describe('DraftService.initializeDraft', () => {
  it('assigns sequential team slots to all members', () => {
    const { membersWithSlots } = DraftService.initializeDraft({
      settings, players, members: [
        { id: 'a', leagueId: 'l1', userId: 'u1', displayName: 'Alice', teamSlot: null, isReady: true, joinedAt: '' },
        { id: 'b', leagueId: 'l1', userId: 'u2', displayName: 'Bob',   teamSlot: null, isReady: true, joinedAt: '' },
      ],
    })
    const slots = membersWithSlots.map(m => m.teamSlot).sort()
    expect(slots).toEqual([1, 2])
  })

  it('returns a DraftState with version 0', () => {
    const { state } = DraftService.initializeDraft({ settings, players, members: baseMembers })
    expect(state.version).toBe(0)
    expect(state.allPlayerIds).toEqual(['p1', 'p2', 'p3', 'p4'])
  })
})
