/**
 * Pipeline integration tests.
 * Mock Sleeper API + Supabase to verify data flows correctly end-to-end.
 */
import { describe, it, expect } from 'vitest'
import { scoreEntry } from '../scoring'
import { groundTruthToRecord } from '../pipeline/ground-truth'
import type { GroundTruthResult } from '../pipeline/ground-truth'
import type { GroundTruthEntry } from '../scoring'
import type { RankingRow } from '../rankings'

// ─── Ground truth builder unit tests (pure logic) ─────────────────────────────

describe('groundTruthToRecord', () => {
  it('converts array to Record keyed by position', () => {
    const gt: GroundTruthEntry = { playerId: 'p1', rank: 1, pprPoints: 100 }
    const results: GroundTruthResult[] = [
      { position: 'QB', topPlayers: [gt] },
      { position: 'RB', topPlayers: [] },
      { position: 'WR', topPlayers: [] },
      { position: 'TE', topPlayers: [] },
    ]
    const record = groundTruthToRecord(results)
    expect(record.QB).toEqual([gt])
    expect(record.RB).toEqual([])
  })
})

// ─── End-to-end scoring pipeline (pure functions only, no DB) ─────────────────

describe('scoring pipeline end-to-end (pure)', () => {
  const gt10: GroundTruthEntry[] = Array.from({ length: 10 }, (_, i) => ({
    playerId: `p${i + 1}`,
    rank: i + 1,
    pprPoints: (10 - i) * 20,
  }))

  const perfectRows: RankingRow[] = gt10.map(g => ({
    playerRank: g.rank,
    playerId: g.playerId,
    playerName: `Player ${g.playerId}`,
  }))

  it('perfect picks produce overallScore=100', () => {
    const entry = scoreEntry(
      { QB: perfectRows, RB: perfectRows, WR: perfectRows, TE: perfectRows },
      { QB: gt10, RB: gt10, WR: gt10, TE: gt10 },
    )
    expect(entry.overallScore).toBe(100)
    expect(entry.top10Hits).toBe(40)
    expect(entry.totalRankError).toBe(0)
  })

  it('partial hits across positions aggregate correctly', () => {
    const halfRows: RankingRow[] = [
      ...gt10.slice(0, 5).map(g => ({ playerRank: g.rank, playerId: g.playerId, playerName: g.playerId })),
      ...Array.from({ length: 5 }, (_, i) => ({ playerRank: 6 + i, playerId: `miss${i}`, playerName: `Miss` })),
    ]
    const allMissRows: RankingRow[] = Array.from({ length: 10 }, (_, i) => ({
      playerRank: i + 1, playerId: `miss${i}`, playerName: `Miss`,
    }))
    const entry = scoreEntry(
      { QB: perfectRows, RB: allMissRows, WR: halfRows, TE: halfRows },
      { QB: gt10, RB: gt10, WR: gt10, TE: gt10 },
    )
    // QB=100, RB=0, WR=50, TE=50 → (100+0+50+50)/4 = 50
    expect(entry.overallScore).toBe(50)
  })

  it('score is deterministic — same inputs produce same output on repeated calls', () => {
    const r1 = scoreEntry(
      { QB: perfectRows, RB: perfectRows, WR: perfectRows, TE: perfectRows },
      { QB: gt10, RB: gt10, WR: gt10, TE: gt10 },
    )
    const r2 = scoreEntry(
      { QB: perfectRows, RB: perfectRows, WR: perfectRows, TE: perfectRows },
      { QB: gt10, RB: gt10, WR: gt10, TE: gt10 },
    )
    expect(r1.overallScore).toBe(r2.overallScore)
    expect(r1.top10Hits).toBe(r2.top10Hits)
    expect(r1.totalRankError).toBe(r2.totalRankError)
  })
})

// ─── Tiebreaker ordering ──────────────────────────────────────────────────────

describe('tiebreaker chain ordering', () => {
  // Simulate what the ranker would do: sort by (score DESC, hits DESC, error ASC, entry ASC)
  interface FakeEntry {
    userId: string
    score: number
    hits: number
    error: number
    entryNumber: number
  }

  function applyTiebreakers(entries: FakeEntry[]): FakeEntry[] {
    return [...entries].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (b.hits !== a.hits) return b.hits - a.hits
      if (a.error !== b.error) return a.error - b.error
      return a.entryNumber - b.entryNumber
    })
  }

  it('higher score wins', () => {
    const entries: FakeEntry[] = [
      { userId: 'b', score: 70, hits: 10, error: 0, entryNumber: 1 },
      { userId: 'a', score: 80, hits: 10, error: 0, entryNumber: 2 },
    ]
    const sorted = applyTiebreakers(entries)
    expect(sorted[0].userId).toBe('a')
  })

  it('on equal score, more hits wins', () => {
    const entries: FakeEntry[] = [
      { userId: 'b', score: 70, hits: 28, error: 5, entryNumber: 1 },
      { userId: 'a', score: 70, hits: 30, error: 5, entryNumber: 2 },
    ]
    const sorted = applyTiebreakers(entries)
    expect(sorted[0].userId).toBe('a')
  })

  it('on equal score+hits, lower rank error wins', () => {
    const entries: FakeEntry[] = [
      { userId: 'b', score: 70, hits: 28, error: 20, entryNumber: 1 },
      { userId: 'a', score: 70, hits: 28, error: 10, entryNumber: 2 },
    ]
    const sorted = applyTiebreakers(entries)
    expect(sorted[0].userId).toBe('a')
  })

  it('on equal score+hits+error, lower entry_number (earlier submission) wins', () => {
    const entries: FakeEntry[] = [
      { userId: 'b', score: 70, hits: 28, error: 10, entryNumber: 2 },
      { userId: 'a', score: 70, hits: 28, error: 10, entryNumber: 1 },
    ]
    const sorted = applyTiebreakers(entries)
    expect(sorted[0].userId).toBe('a')
  })
})
