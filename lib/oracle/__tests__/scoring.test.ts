import { describe, it, expect } from 'vitest'
import { scorePosition, scoreEntry, generateSummary } from '../scoring'
import type { GroundTruthEntry, OracleResult } from '../scoring'
import type { RankingRow } from '../rankings'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeGT(count = 10): GroundTruthEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    playerId: `p${i + 1}`,
    rank: i + 1,
    pprPoints: (10 - i) * 10,
  }))
}

function makeRows(playerIds: string[], startRank = 1): RankingRow[] {
  return playerIds.map((id, i) => ({
    playerRank: startRank + i,
    playerId: id,
    playerName: `Player ${id}`,
  }))
}

const gt10 = makeGT(10)
const exactRows = makeRows(['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10'])

// ─── scorePosition ─────────────────────────────────────────────────────────────

describe('scorePosition', () => {
  it('returns 100 for perfect picks', () => {
    const result = scorePosition(exactRows, gt10)
    expect(result.score).toBe(100)
    expect(result.top10Hits).toBe(10)
    expect(result.totalRankError).toBe(0)
    expect(result.details).toHaveLength(10)
    result.details.forEach(d => expect(d.points).toBe(10))
  })

  it('returns 0 for all misses', () => {
    const rows = makeRows(['x1','x2','x3','x4','x5','x6','x7','x8','x9','x10'])
    const result = scorePosition(rows, gt10)
    expect(result.score).toBe(0)
    expect(result.top10Hits).toBe(0)
    expect(result.totalRankError).toBe(0)
    result.details.forEach(d => {
      expect(d.points).toBe(0)
      expect(d.actualRank).toBeNull()
    })
  })

  it('returns 0 for empty user picks', () => {
    const result = scorePosition([], gt10)
    expect(result.score).toBe(0)
    expect(result.top10Hits).toBe(0)
    expect(result.totalRankError).toBe(0)
    expect(result.details).toHaveLength(0)
  })

  it('returns 0 for empty ground truth', () => {
    const result = scorePosition(exactRows, [])
    expect(result.score).toBe(0)
    expect(result.top10Hits).toBe(0)
  })

  it('off by 1 in every slot gives 9 pts each (except wraparound)', () => {
    // User ranks p2 at #1, p3 at #2, ... p10 at #9, p1 at #10
    // p2-p10 are off by 1 (9 pts each), but p1 is off by 9 (1 pt)
    const shiftedRows: RankingRow[] = [
      { playerRank: 1, playerId: 'p2', playerName: 'P2' },
      { playerRank: 2, playerId: 'p3', playerName: 'P3' },
      { playerRank: 3, playerId: 'p4', playerName: 'P4' },
      { playerRank: 4, playerId: 'p5', playerName: 'P5' },
      { playerRank: 5, playerId: 'p6', playerName: 'P6' },
      { playerRank: 6, playerId: 'p7', playerName: 'P7' },
      { playerRank: 7, playerId: 'p8', playerName: 'P8' },
      { playerRank: 8, playerId: 'p9', playerName: 'P9' },
      { playerRank: 9, playerId: 'p10', playerName: 'P10' },
      { playerRank: 10, playerId: 'p1', playerName: 'P1' },
    ]
    const result = scorePosition(shiftedRows, gt10)
    expect(result.score).toBe(82)             // 9×9 + 1 (p1 at position 10 but actual rank 1 = distance 9 = 1pt)
    expect(result.top10Hits).toBe(10)
    expect(result.totalRankError).toBe(18)    // 1+1+1+1+1+1+1+1+1+9
    expect(result.details.slice(0, 9).forEach(d => expect(d.points).toBe(9)))
    expect(result.details[9].points).toBe(1)  // p1 at position 10 has only 1 pt
  })

  it('max distance within top 10 gives 1 pt (not 0)', () => {
    // User picks p1 at rank 10, p10 at rank 1 — both still in top 10
    const rows: RankingRow[] = [
      { playerRank: 1, playerId: 'p10', playerName: 'P10' },
      { playerRank: 2, playerId: 'p9', playerName: 'P9' },
      { playerRank: 3, playerId: 'p8', playerName: 'P8' },
      { playerRank: 4, playerId: 'p7', playerName: 'P7' },
      { playerRank: 5, playerId: 'p6', playerName: 'P6' },
      { playerRank: 6, playerId: 'p5', playerName: 'P5' },
      { playerRank: 7, playerId: 'p4', playerName: 'P4' },
      { playerRank: 8, playerId: 'p3', playerName: 'P3' },
      { playerRank: 9, playerId: 'p2', playerName: 'P2' },
      { playerRank: 10, playerId: 'p1', playerName: 'P1' },
    ]
    const result = scorePosition(rows, gt10)
    // p10 user#1 actual#10 → |1-10|=9 → 1pt
    // p1  user#10 actual#1 → |10-1|=9 → 1pt
    result.details.forEach(d => expect(d.points).toBeGreaterThanOrEqual(1))
  })

  it('partial picks (5 of 10 in top 10) scores only those 5', () => {
    const rows: RankingRow[] = [
      { playerRank: 1, playerId: 'p1', playerName: 'P1' },
      { playerRank: 2, playerId: 'p2', playerName: 'P2' },
      { playerRank: 3, playerId: 'p3', playerName: 'P3' },
      { playerRank: 4, playerId: 'p4', playerName: 'P4' },
      { playerRank: 5, playerId: 'p5', playerName: 'P5' },
      { playerRank: 6, playerId: 'x1', playerName: 'X1' },
      { playerRank: 7, playerId: 'x2', playerName: 'X2' },
      { playerRank: 8, playerId: 'x3', playerName: 'X3' },
      { playerRank: 9, playerId: 'x4', playerName: 'X4' },
      { playerRank: 10, playerId: 'x5', playerName: 'X5' },
    ]
    const result = scorePosition(rows, gt10)
    expect(result.score).toBe(50)   // 5 exact matches × 10 pts
    expect(result.top10Hits).toBe(5)
    expect(result.totalRankError).toBe(0)
  })

  it('score is bounded 0-100', () => {
    expect(scorePosition(exactRows, gt10).score).toBeLessThanOrEqual(100)
    expect(scorePosition(exactRows, gt10).score).toBeGreaterThanOrEqual(0)
  })
})

// ─── scoreEntry ───────────────────────────────────────────────────────────────

describe('scoreEntry', () => {
  const emptyPicks = { QB: [], RB: [], WR: [], TE: [] }
  const emptyGT = { QB: [], RB: [], WR: [], TE: [] }
  const perfectPicks = { QB: exactRows, RB: exactRows, WR: exactRows, TE: exactRows }
  const perfectGT = { QB: gt10, RB: gt10, WR: gt10, TE: gt10 }

  it('perfect entry scores 100 overall', () => {
    const entry = scoreEntry(perfectPicks, perfectGT)
    expect(entry.overallScore).toBe(100)
    expect(entry.top10Hits).toBe(40)
    expect(entry.totalRankError).toBe(0)
  })

  it('empty picks scores 0 overall', () => {
    const entry = scoreEntry(emptyPicks, emptyGT)
    expect(entry.overallScore).toBe(0)
    expect(entry.top10Hits).toBe(0)
  })

  it('overallScore = (QB + RB + WR + TE) / 4', () => {
    const mixedPicks = {
      QB: exactRows,        // 100
      RB: makeRows(['x1','x2','x3','x4','x5','x6','x7','x8','x9','x10']), // 0
      WR: makeRows(['p1','p2','p3','p4','p5','x1','x2','x3','x4','x5']),  // 50
      TE: makeRows(['p2','p3','p4','p5','p6','p7','p8','p9','p10','p1']), // 82 (shifted like the other test)
    }
    const entry = scoreEntry(mixedPicks, perfectGT)
    expect(entry.overallScore).toBe((100 + 0 + 50 + 82) / 4)  // 58
  })

  it('all four position results present in output', () => {
    const entry = scoreEntry(perfectPicks, perfectGT)
    expect(entry.positions.QB).toBeDefined()
    expect(entry.positions.RB).toBeDefined()
    expect(entry.positions.WR).toBeDefined()
    expect(entry.positions.TE).toBeDefined()
  })
})

// ─── generateSummary (backward-compatible) ───────────────────────────────────

describe('generateSummary', () => {
  function makeResult(qb: number, rb: number, wr: number, te: number): OracleResult {
    const overall = (qb + rb + wr + te) / 4
    return {
      overallScore: overall,
      positionResults: [
        { position: 'QB', normalizedScore: qb, players: [] },
        { position: 'RB', normalizedScore: rb, players: [] },
        { position: 'WR', normalizedScore: wr, players: [] },
        { position: 'TE', normalizedScore: te, players: [] },
      ],
    }
  }

  it('returns exceptional message for score >= 90', () => {
    const summary = generateSummary(makeResult(100, 90, 90, 90))
    expect(summary).toMatch(/exceptional/i)
  })

  it('returns strong message for score >= 75', () => {
    const summary = generateSummary(makeResult(80, 80, 80, 60))
    expect(summary).toMatch(/strong/i)
  })

  it('returns improvement message for score < 75', () => {
    const summary = generateSummary(makeResult(60, 40, 30, 50))
    expect(summary).toMatch(/accuracy/i)
  })
})
