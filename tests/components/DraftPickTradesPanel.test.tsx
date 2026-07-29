import { describe, it, expect } from 'vitest'
import type { TradeRecord } from '@/lib/draft/types'

// ──────────────────────────────────────────────────────────
// Pure helpers mirrored from DraftPickTradesPanel.tsx
// ──────────────────────────────────────────────────────────

function buildBaseMap(numTeams: number, numRounds: number): Map<string, number> {
  const map = new Map<string, number>()
  for (let r = 1; r <= numRounds; r++) {
    for (let s = 1; s <= numTeams; s++) {
      map.set(`${r}_${s}`, s)
    }
  }
  return map
}

function applyTradeToMap(
  map: Map<string, number>,
  trade: TradeRecord,
  userSlot: number,
): Map<string, number> {
  const next = new Map(map)
  for (const p of trade.youGive)    next.set(`${p.round}_${p.teamSlot}`, trade.opponentSlot)
  for (const p of trade.youReceive) next.set(`${p.round}_${p.teamSlot}`, userSlot)
  return next
}

function buildOwnershipMapFromTrades(
  trades: TradeRecord[],
  numTeams: number,
  numRounds: number,
  userSlot: number,
): Map<string, number> {
  let map = buildBaseMap(numTeams, numRounds)
  for (const t of trades) map = applyTradeToMap(map, t, userSlot)
  return map
}

// ──────────────────────────────────────────────────────────

describe('buildBaseMap', () => {
  it('creates numTeams × numRounds entries', () => {
    const map = buildBaseMap(4, 3)
    expect(map.size).toBe(12)
  })

  it('each pick owned by its teamSlot initially', () => {
    const map = buildBaseMap(3, 2)
    expect(map.get('1_1')).toBe(1)
    expect(map.get('1_2')).toBe(2)
    expect(map.get('1_3')).toBe(3)
    expect(map.get('2_1')).toBe(1)
    expect(map.get('2_3')).toBe(3)
  })

  it('works with numTeams=12 numRounds=15', () => {
    const map = buildBaseMap(12, 15)
    expect(map.size).toBe(180)
    expect(map.get('15_12')).toBe(12)
  })
})

describe('applyTradeToMap', () => {
  it('youGive picks go to opponentSlot', () => {
    const base = buildBaseMap(4, 2)
    const trade: TradeRecord = {
      id: 't1',
      opponentSlot: 3,
      youGive: [{ round: 1, teamSlot: 1 }],
      youReceive: [],
    }
    const result = applyTradeToMap(base, trade, 1)
    expect(result.get('1_1')).toBe(3) // user gave away pick 1.01 → now owned by team 3
  })

  it('youReceive picks go to userSlot', () => {
    const base = buildBaseMap(4, 2)
    const trade: TradeRecord = {
      id: 't2',
      opponentSlot: 3,
      youGive: [],
      youReceive: [{ round: 1, teamSlot: 3 }],
    }
    const result = applyTradeToMap(base, trade, 1)
    expect(result.get('1_3')).toBe(1) // user received pick 1.03 → now owned by user (slot 1)
  })

  it('does not mutate the input map', () => {
    const base = buildBaseMap(4, 2)
    const snapBefore = base.get('1_1')
    const trade: TradeRecord = {
      id: 't3',
      opponentSlot: 2,
      youGive: [{ round: 1, teamSlot: 1 }],
      youReceive: [],
    }
    applyTradeToMap(base, trade, 1)
    expect(base.get('1_1')).toBe(snapBefore) // original unchanged
  })

  it('applies both give and receive in one trade', () => {
    const base = buildBaseMap(4, 2)
    const trade: TradeRecord = {
      id: 't4',
      opponentSlot: 2,
      youGive: [{ round: 1, teamSlot: 1 }],
      youReceive: [{ round: 2, teamSlot: 2 }],
    }
    const result = applyTradeToMap(base, trade, 1)
    expect(result.get('1_1')).toBe(2) // gave 1.01 to team 2
    expect(result.get('2_2')).toBe(1) // received 2.02 from team 2
  })
})

describe('buildOwnershipMapFromTrades', () => {
  it('returns base map when no trades', () => {
    const map = buildOwnershipMapFromTrades([], 4, 2, 1)
    expect(map.size).toBe(8)
    expect(map.get('1_1')).toBe(1)
    expect(map.get('2_4')).toBe(4)
  })

  it('applies a single trade', () => {
    const trade: TradeRecord = {
      id: 't1',
      opponentSlot: 4,
      youGive: [{ round: 1, teamSlot: 1 }],
      youReceive: [{ round: 1, teamSlot: 4 }],
    }
    const map = buildOwnershipMapFromTrades([trade], 4, 2, 1)
    expect(map.get('1_1')).toBe(4) // gave to team 4
    expect(map.get('1_4')).toBe(1) // received from team 4
    expect(map.get('2_1')).toBe(1) // untouched
  })

  it('applies multiple trades sequentially', () => {
    const t1: TradeRecord = {
      id: 't1',
      opponentSlot: 2,
      youGive: [{ round: 1, teamSlot: 1 }],
      youReceive: [{ round: 1, teamSlot: 2 }],
    }
    const t2: TradeRecord = {
      id: 't2',
      opponentSlot: 3,
      // user now owns 1_2 after t1; give it away
      youGive: [{ round: 1, teamSlot: 2 }],
      youReceive: [{ round: 2, teamSlot: 3 }],
    }
    const map = buildOwnershipMapFromTrades([t1, t2], 4, 2, 1)
    expect(map.get('1_1')).toBe(2) // given to team 2 in t1
    expect(map.get('1_2')).toBe(3) // given to team 3 in t2 (user received it in t1, then gave it)
    expect(map.get('2_3')).toBe(1) // received from team 3 in t2
  })

  it('handles empty youGive / empty youReceive', () => {
    const trade: TradeRecord = {
      id: 't1',
      opponentSlot: 2,
      youGive: [],
      youReceive: [{ round: 1, teamSlot: 2 }],
    }
    const map = buildOwnershipMapFromTrades([trade], 4, 2, 1)
    expect(map.get('1_2')).toBe(1)
    expect(map.get('1_1')).toBe(1) // user keeps own pick
  })

  it('produces correct size for 12 teams, 15 rounds', () => {
    const map = buildOwnershipMapFromTrades([], 12, 15, 6)
    expect(map.size).toBe(180)
  })
})
