import { scoreRankings, applyConfidence } from '../scoring'

describe('scoreRankings', () => {
  it('returns 50 for exact match', () => expect(scoreRankings(1, 1)).toBe(50))
  it('returns 45 for off by 1',    () => expect(scoreRankings(1, 2)).toBe(45))
  it('returns 5 for off by 9',     () => expect(scoreRankings(1, 10)).toBe(5))
  it('returns 0 for off by 10',    () => expect(scoreRankings(1, 11)).toBe(0))
  it('returns 0 for not in tier',  () => expect(scoreRankings(1, null as unknown as number)).toBe(0))
})

describe('applyConfidence', () => {
  it('high confidence + high score = 1.5x', () => {
    expect(applyConfidence(50, 'high', 0)).toBe(75)
  })
  it('high confidence + miss = 0.5x', () => {
    expect(applyConfidence(0, 'high', 11)).toBe(0) // 0 * 0.5 = 0
  })
  it('medium confidence + high score = 1.2x', () => {
    expect(applyConfidence(50, 'medium', 0)).toBeCloseTo(60)
  })
  it('low confidence = no modifier', () => {
    expect(applyConfidence(40, 'low', 2)).toBe(40)
  })
})
