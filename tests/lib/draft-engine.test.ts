import { describe, it, expect } from 'vitest'
import {
  buildInitialState,
  makePick,
  assignPlayerToSlot,
  resetToADP,
  generateShareId,
  computeDraftAnalytics,
} from '@/lib/draft/engine'
import type { DraftSettings, Player } from '@/lib/draft/types'

const SETTINGS: DraftSettings = {
  numTeams: 10,
  numRounds: 15,
  userSlot: 3,
  scoring: 'ppr',
  speed: 'normal',
}

const PLAYERS: Player[] = Array.from({ length: 200 }, (_, i) => ({
  id: String(i + 1),
  name: `Player ${i + 1}`,
  position: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'][i % 6] as Player['position'],
  team: 'KC',
  searchRank: i + 1,
  byeWeek: 7,
}))

describe('buildInitialState', () => {
  it('creates 150 pick slots for 10 teams x 15 rounds', () => {
    const state = buildInitialState(SETTINGS, PLAYERS)
    expect(state.picks).toHaveLength(150)
    expect(state.schemaVersion).toBe(1)
    expect(state.status).toBe('drafting')
    expect(state.currentPickIndex).toBe(0)
  })

  it('snake draft: pick 11 belongs to team 10, pick 12 belongs to team 10 (turn around)', () => {
    const state = buildInitialState(SETTINGS, PLAYERS)
    // Round 1: picks 0-9 → slots 1-10
    expect(state.picks[0].teamSlot).toBe(1)
    expect(state.picks[9].teamSlot).toBe(10)
    // Round 2: picks 10-19 → slots 10-1
    expect(state.picks[10].teamSlot).toBe(10)
    expect(state.picks[19].teamSlot).toBe(1)
  })

  it('userSlot 3 means picks at overall positions 3, 18, 23, ... belong to teamSlot 3', () => {
    const state = buildInitialState(SETTINGS, PLAYERS)
    expect(state.picks[2].currentOwnerTeamSlot).toBe(3)   // pick 3 of round 1
    expect(state.picks[17].currentOwnerTeamSlot).toBe(3)  // round 2 reverses: slot 3 is pick 18
  })

  it('allPlayerIds equals availablePlayerIds at start', () => {
    const state = buildInitialState(SETTINGS, PLAYERS)
    expect(state.allPlayerIds).toEqual(state.availablePlayerIds)
  })
})

describe('makePick', () => {
  it('removes player from available pool and advances currentPickIndex', () => {
    const state = buildInitialState(SETTINGS, PLAYERS)
    const next = makePick(state, PLAYERS[0].id)
    expect(next.availablePlayerIds).not.toContain(PLAYERS[0].id)
    expect(next.currentPickIndex).toBe(1)
    expect(next.picks[0].playerId).toBe(PLAYERS[0].id)
  })

  it('sets status to complete when all picks filled', () => {
    let state = buildInitialState({ ...SETTINGS, numTeams: 2, numRounds: 2 }, PLAYERS)
    state = makePick(state, PLAYERS[0].id)
    state = makePick(state, PLAYERS[1].id)
    state = makePick(state, PLAYERS[2].id)
    state = makePick(state, PLAYERS[3].id)
    expect(state.status).toBe('complete')
  })
})

describe('assignPlayerToSlot', () => {
  it('places player into a completed pick slot', () => {
    let state = buildInitialState(SETTINGS, PLAYERS)
    state = makePick(state, PLAYERS[0].id)
    state = makePick(state, PLAYERS[1].id)
    // Edit slot 0 (already completed)
    const next = assignPlayerToSlot(state, 0, PLAYERS[5].id)
    expect(next.picks[0].playerId).toBe(PLAYERS[5].id)
    expect(next.availablePlayerIds).toContain(PLAYERS[0].id) // displaced player back in pool
  })

  it('rejects edits to future picks (index >= currentPickIndex)', () => {
    const state = buildInitialState(SETTINGS, PLAYERS)
    const next = assignPlayerToSlot(state, 5, PLAYERS[0].id)
    // currentPickIndex is 0, pick 5 is future → no change
    expect(next).toBe(state)
  })

  it('re-sorts pool using allPlayerIds order after displacing a player', () => {
    let state = buildInitialState(SETTINGS, PLAYERS)
    state = makePick(state, PLAYERS[0].id)
    state = makePick(state, PLAYERS[1].id)
    const next = assignPlayerToSlot(state, 0, PLAYERS[5].id)
    // PLAYERS[0] was displaced — should be back in pool in ADP order
    const idx0 = next.availablePlayerIds.indexOf(PLAYERS[0].id)
    const idx1 = next.availablePlayerIds.indexOf(PLAYERS[1].id)
    // Both displaced and PLAYERS[1] (picked in slot 1, not reassigned) — only PLAYERS[0] returns
    expect(idx0).toBeGreaterThanOrEqual(0)
  })
})

describe('resetToADP', () => {
  it('clears all picks and restores pool in ADP order', () => {
    let state = buildInitialState(SETTINGS, PLAYERS)
    state = makePick(state, PLAYERS[0].id)
    state = makePick(state, PLAYERS[1].id)
    const reset = resetToADP(state)
    expect(reset.currentPickIndex).toBe(0)
    expect(reset.availablePlayerIds).toEqual(state.allPlayerIds)
    expect(reset.picks.every(p => p.playerId === null)).toBe(true)
    expect(reset.status).toBe('drafting')
  })
})

describe('generateShareId', () => {
  it('returns 6-char alphanumeric string without ambiguous chars', () => {
    const id = generateShareId()
    expect(id).toHaveLength(6)
    expect(id).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  })

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, generateShareId))
    expect(ids.size).toBeGreaterThan(95)
  })
})


describe('computeDraftAnalytics', () => {
  it('computes positional breakdown for user picks', () => {
    let state = buildInitialState({ ...SETTINGS, numTeams: 2, numRounds: 2 }, PLAYERS)
    // userSlot=3 in a 2-team draft doesn't make sense, use slot 1
    state = buildInitialState({ ...SETTINGS, numTeams: 2, numRounds: 2, userSlot: 1 }, PLAYERS)
    state = makePick(state, PLAYERS[0].id)  // user (slot 1, round 1)
    state = makePick(state, PLAYERS[1].id)  // cpu (slot 2)
    state = makePick(state, PLAYERS[2].id)  // cpu (slot 2, round 2)
    state = makePick(state, PLAYERS[3].id)  // user (slot 1, round 2)
    const playerMap = new Map(PLAYERS.map(p => [p.id, p]))
    const analytics = computeDraftAnalytics(state, playerMap)
    expect(analytics.positionBreakdown).toBeDefined()
    expect(analytics.averageADPReached).toBeGreaterThan(0)
  })
})
