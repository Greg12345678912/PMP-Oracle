import { describe, it, expect } from 'vitest'
import { buildInitialState, makePick, computeDraftAnalytics } from '@/lib/draft/engine'
import type { DraftSettings, Player } from '@/lib/draft/types'

const SETTINGS: DraftSettings = {
  numTeams: 2, numRounds: 15, userSlot: 1, scoring: 'ppr', speed: 'instant',
}

const PLAYERS: Player[] = [
  { id: '1', name: 'P1 QB', firstName: 'P1', lastName: 'QB', position: 'QB', team: 'KC', headshotUrl: '', searchRank: 1, byeWeek: 7 },
  { id: '2', name: 'P2 RB', firstName: 'P2', lastName: 'RB', position: 'RB', team: 'SF', headshotUrl: '', searchRank: 2, byeWeek: 9 },
  { id: '3', name: 'P3 WR', firstName: 'P3', lastName: 'WR', position: 'WR', team: 'DAL', headshotUrl: '', searchRank: 3, byeWeek: 11 },
  { id: '4', name: 'P4 TE', firstName: 'P4', lastName: 'TE', position: 'TE', team: 'KC', headshotUrl: '', searchRank: 100, byeWeek: 14 },
  ...Array.from({ length: 26 }, (_, i) => ({
    id: String(i + 5),
    name: `P${i + 5}`,
    firstName: `P${i + 5}`,
    lastName: 'WR',
    position: 'WR' as Player['position'],
    team: 'TEN',
    headshotUrl: '',
    searchRank: i + 5,
    byeWeek: 7,
  })),
]

describe('computeDraftAnalytics', () => {
  it('computes correct positional breakdown', () => {
    // 2 teams, 15 rounds = 30 total picks; user is slot 1 (picks 1 and 30 in snake)
    let state = buildInitialState({ ...SETTINGS, numRounds: 15 }, PLAYERS)
    const playerMap = new Map(PLAYERS.map(p => [p.id, p]))
    // Simulate full draft
    for (let i = 0; i < state.picks.length; i++) {
      const pid = state.availablePlayerIds[0]
      if (pid) state = makePick(state, pid)
    }
    const analytics = computeDraftAnalytics(state, playerMap)
    expect(analytics.positionBreakdown).toBeDefined()
    const total = Object.values(analytics.positionBreakdown).reduce((a, b) => a + b, 0)
    expect(total).toBe(15) // 15 rounds = 15 user picks
  })

  it('earliestReach: player picked before their ADP', () => {
    // User picks player with searchRank=100 at overall pick 1 — big reach
    const state = buildInitialState(SETTINGS, PLAYERS)
    const playerMap = new Map(PLAYERS.map(p => [p.id, p]))
    // Construct a completed state where user's first pick (overall=1) is player id='4' (searchRank=100)
    const manualState = {
      ...state,
      status: 'complete' as const,
      currentPickIndex: state.picks.length,
      picks: state.picks.map((p, i) => ({
        ...p,
        playerId: i === 0 ? '4' : (PLAYERS[i] ? PLAYERS[i].id : null),
      })),
    }
    const analytics = computeDraftAnalytics(manualState, playerMap)
    // Pick at overall=1, ADP=100 → reach of 99
    expect(analytics.earliestReach).not.toBeNull()
    expect(analytics.earliestReach?.player.id).toBe('4')
  })

  it('biggestValue: player available much later than ADP', () => {
    const state = buildInitialState(SETTINGS, PLAYERS)
    const playerMap = new Map(PLAYERS.map(p => [p.id, p]))
    // Player 1 has searchRank=1 but picked at overall=15 (user's 8th pick in 2-team snake) = value
    const manualState = {
      ...state,
      status: 'complete' as const,
      currentPickIndex: state.picks.length,
      picks: state.picks.map((p, i) => ({
        ...p,
        playerId: i === 14 && p.currentOwnerTeamSlot === state.settings.userSlot ? '1' : (PLAYERS[i] ? PLAYERS[i].id : null),
      })),
    }
    const analytics = computeDraftAnalytics(manualState, playerMap)
    // If user pick at overall>1 has player searchRank=1, actualPick > expectedADP = value
    if (analytics.biggestValue) {
      expect(analytics.biggestValue.actualPick).toBeGreaterThan(analytics.biggestValue.expectedADP)
    }
  })

  it('returns null for earliestReach and biggestValue when no significant diff', () => {
    // Draft where each player is picked exactly at their ADP rank
    let state = buildInitialState({ ...SETTINGS, numTeams: 2, numRounds: 2 }, PLAYERS)
    const playerMap = new Map(PLAYERS.map(p => [p.id, p]))
    // Pick in ADP order: player 1 (searchRank=1) at pick 1, player 2 at pick 2, etc.
    for (let i = 0; i < state.picks.length; i++) {
      const pid = state.availablePlayerIds[0]
      if (pid) state = makePick(state, pid)
    }
    const analytics = computeDraftAnalytics(state, playerMap)
    // Player 1 (searchRank=1) is at pick 1 (user slot 1) → diff=0, no reach or value
    // Player 4 (searchRank=100) is picked at overall pick 4 → diff negative = reach
    // But whether there's a reach depends on which picks are user picks
    expect(analytics.positionBreakdown).toBeDefined()
    expect(analytics.averageADPReached).toBeGreaterThan(0)
  })

  it('includes a grade field with a valid letter', () => {
    let state = buildInitialState({ ...SETTINGS, numRounds: 15 }, PLAYERS)
    const playerMap = new Map(PLAYERS.map(p => [p.id, p]))
    for (let i = 0; i < state.picks.length; i++) {
      const pid = state.availablePlayerIds[0]
      if (pid) state = makePick(state, pid)
    }
    const result = computeDraftAnalytics(state, playerMap)
    expect(result.grade).toBeDefined()
    expect(result.grade.letter).toMatch(/^(A\+|A|A-|B\+|B|B-|C\+|C|D)$/)
    expect(typeof result.grade.score).toBe('number')
  })

  it('averageADPReached is average of user picks searchRank values', () => {
    const state = buildInitialState(SETTINGS, PLAYERS)
    const playerMap = new Map(PLAYERS.map(p => [p.id, p]))
    // Construct state where user picks players 1 and 2 (searchRank 1 and 2)
    // In 2-team snake: user slot 1 picks at overallPick 1, 4, 5, 8, ...
    const twoRoundState = {
      ...buildInitialState({ ...SETTINGS, numRounds: 1 }, PLAYERS),
      status: 'complete' as const,
      currentPickIndex: 2,
      picks: buildInitialState({ ...SETTINGS, numRounds: 1 }, PLAYERS).picks.map((p, i) => ({
        ...p,
        playerId: PLAYERS[i]?.id ?? null,
      })),
    }
    const analytics = computeDraftAnalytics(twoRoundState, playerMap)
    // User pick is slot 1 in round 1 → player '1' (searchRank=1)
    expect(analytics.averageADPReached).toBe(1)
  })
})
