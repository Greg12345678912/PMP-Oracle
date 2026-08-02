import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { scorePosition, scoreEntry } from '../scoring'
import type { GroundTruthEntry } from '../scoring'
import type { RankingRow } from '../rankings'

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const arbPlayerId = fc.string({ minLength: 1, maxLength: 8 })

const arbGroundTruth = fc.uniqueArray(arbPlayerId, { minLength: 1, maxLength: 10 }).map(ids =>
  ids.map((id, i): GroundTruthEntry => ({
    playerId: id,
    rank: i + 1,
    pprPoints: Math.max(0, (10 - i) * 5),
  }))
)

const arbUserRows = (playerPool: string[]) =>
  fc
    .uniqueArray(fc.constantFrom(...playerPool), { minLength: 0, maxLength: 10 })
    .map(ids =>
      ids.map((id, i): RankingRow => ({
        playerRank: i + 1,
        playerId: id,
        playerName: `Player ${id}`,
      }))
    )

// ─── Properties ───────────────────────────────────────────────────────────────

describe('scorePosition properties', () => {
  it('score is always between 0 and 100', () => {
    fc.assert(
      fc.property(arbGroundTruth, gt => {
        const pool = [...gt.map(g => g.playerId), 'miss1', 'miss2', 'miss3']
        return fc.sample(arbUserRows(pool), 1).every(rows => {
          const result = scorePosition(rows, gt)
          return result.score >= 0 && result.score <= 100
        })
      }),
    )
  })

  it('top10Hits is always <= number of user rows', () => {
    fc.assert(
      fc.property(arbGroundTruth, gt => {
        const pool = [...gt.map(g => g.playerId), 'miss1', 'miss2']
        return fc.sample(arbUserRows(pool), 1).every(rows => {
          const result = scorePosition(rows, gt)
          return result.top10Hits <= rows.length
        })
      }),
    )
  })

  it('totalRankError is 0 when user picks exactly match ground truth positions', () => {
    fc.assert(
      fc.property(arbGroundTruth, gt => {
        const exactRows: RankingRow[] = gt.map(g => ({
          playerRank: g.rank,
          playerId: g.playerId,
          playerName: `Player ${g.playerId}`,
        }))
        const result = scorePosition(exactRows, gt)
        return result.totalRankError === 0
      }),
    )
  })

  it('players in actual top 10 always earn >= 1 point (correct player never scores 0)', () => {
    fc.assert(
      fc.property(arbGroundTruth, gt => {
        // Ranks within 1-10 can be at most 9 apart (rank 1 vs rank 10)
        // so points = max(0, 10-9) = 1 minimum
        const exactRows: RankingRow[] = gt.map(g => ({
          playerRank: g.rank,
          playerId: g.playerId,
          playerName: `Player ${g.playerId}`,
        }))
        const result = scorePosition(exactRows, gt)
        return result.details
          .filter(d => d.actualRank !== null)
          .every(d => d.points >= 1)
      }),
    )
  })

  it('empty user rows always returns score=0, top10Hits=0', () => {
    fc.assert(
      fc.property(arbGroundTruth, gt => {
        const result = scorePosition([], gt)
        return result.score === 0 && result.top10Hits === 0 && result.details.length === 0
      }),
    )
  })

  it('score with all misses is 0 regardless of ground truth', () => {
    fc.assert(
      fc.property(arbGroundTruth, gt => {
        const missRows: RankingRow[] = Array.from({ length: 10 }, (_, i) => ({
          playerRank: i + 1,
          playerId: `guaranteed_miss_${i}`,
          playerName: `Miss ${i}`,
        }))
        const result = scorePosition(missRows, gt)
        return result.score === 0 && result.top10Hits === 0
      }),
    )
  })
})

describe('scoreEntry properties', () => {
  it('overallScore = arithmetic mean of 4 position scores', () => {
    fc.assert(
      fc.property(arbGroundTruth, gt => {
        const rows: RankingRow[] = gt.map(g => ({
          playerRank: g.rank,
          playerId: g.playerId,
          playerName: `Player ${g.playerId}`,
        }))
        const picks = { QB: rows, RB: rows, WR: rows, TE: rows }
        const truth = { QB: gt, RB: gt, WR: gt, TE: gt }
        const entry = scoreEntry(picks, truth)
        const expectedOverall = (
          entry.positions.QB.score +
          entry.positions.RB.score +
          entry.positions.WR.score +
          entry.positions.TE.score
        ) / 4
        return Math.abs(entry.overallScore - expectedOverall) < 1e-9
      }),
    )
  })

  it('overallScore is always between 0 and 100', () => {
    fc.assert(
      fc.property(arbGroundTruth, gt => {
        const rows: RankingRow[] = gt.map(g => ({
          playerRank: g.rank,
          playerId: g.playerId,
          playerName: `Player ${g.playerId}`,
        }))
        const picks = { QB: rows, RB: rows, WR: rows, TE: rows }
        const truth = { QB: gt, RB: gt, WR: gt, TE: gt }
        const entry = scoreEntry(picks, truth)
        return entry.overallScore >= 0 && entry.overallScore <= 100
      }),
    )
  })
})
