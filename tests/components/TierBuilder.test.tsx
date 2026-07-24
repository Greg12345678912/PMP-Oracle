import { describe, it, expect } from 'vitest'
import { buildInitialState, applyMoveToTier, clearAll, resetTiers } from '@/components/tier-builder/TierBuilder'
import type { Player } from '@/lib/data/types'
import { DEFAULT_TIER_LABELS } from '@/lib/data/types'

const players: Player[] = [
  { id: '1', name: 'CMC', firstName: 'Christian', lastName: 'McCaffrey', team: 'SF', position: 'RB', headshotUrl: '', searchRank: 1 },
  { id: '2', name: 'Bijan', firstName: 'Bijan', lastName: 'Robinson', team: 'ATL', position: 'RB', headshotUrl: '', searchRank: 2 },
]

describe('buildInitialState', () => {
  it('creates 6 default empty tiers', () => {
    const state = buildInitialState(players, 'RB')
    expect(state.tiers).toHaveLength(6)
    expect(state.tiers.map(t => t.label)).toEqual([...DEFAULT_TIER_LABELS])
    expect(state.tiers.every(t => t.playerIds.length === 0)).toBe(true)
  })

  it('puts all player IDs in the pool', () => {
    const state = buildInitialState(players, 'RB')
    expect(state.pool).toContain('1')
    expect(state.pool).toContain('2')
  })
})

describe('clearAll', () => {
  it('moves all tier player IDs back to pool', () => {
    const state = buildInitialState(players, 'RB')
    const withPlayers = {
      ...state,
      tiers: [{ ...state.tiers[0], playerIds: ['1'] }, ...state.tiers.slice(1)],
      pool: ['2'],
    }
    const cleared = clearAll(withPlayers)
    expect(cleared.pool).toContain('1')
    expect(cleared.pool).toContain('2')
    expect(cleared.tiers.every(t => t.playerIds.length === 0)).toBe(true)
  })
})

describe('resetTiers', () => {
  it('returns to initial empty state', () => {
    const initial = buildInitialState(players, 'RB')
    const modified = { ...initial, tiers: [{ ...initial.tiers[0], playerIds: ['1'] }] }
    const reset = resetTiers(modified, players)
    expect(reset).toEqual(initial)
  })
})
