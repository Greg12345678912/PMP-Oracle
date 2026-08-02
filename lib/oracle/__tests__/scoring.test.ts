import { describe, it, expect } from 'vitest'
import { scorePosition, scoreEntry } from '../scoring'
import type { GroundTruthEntry } from '../scoring'
import type { RankingRow } from '../rankings'
import { ORACLE_POSITIONS } from '../constants'

const gt10: GroundTruthEntry[] = Array.from({ length: 10 }, (_, i) => ({
  playerId: `p${i + 1}`,
  rank: i + 1,
  pprPoints: (10 - i) * 10,
}))

const rows10: RankingRow[] = Array.from({ length: 10 }, (_, i) => ({
  playerRank: i + 1,
  playerId: `p${i + 1}`,
  playerName: `Player ${i + 1}`,
}))

describe('scorePosition', () => {
  it('perfect score returns 100', () => {
    const result = scorePosition(rows10, gt10)
    expect(result.score).toBe(100)
    expect(result.top10Hits).toBe(10)
    expect(result.totalRankError).toBe(0)
  })
})
