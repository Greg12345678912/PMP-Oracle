import { positionFilter } from '../players'

describe('positionFilter', () => {
  it('matches QB players', () => {
    const p = { position: 'QB', fantasyPositions: ['QB'] }
    expect(positionFilter('QB')(p as any)).toBe(true)
  })
  it('excludes WR from QB filter', () => {
    const p = { position: 'WR', fantasyPositions: ['WR', 'FLEX'] }
    expect(positionFilter('QB')(p as any)).toBe(false)
  })
  it('includes FLEX-eligible RBs', () => {
    const p = { position: 'RB', fantasyPositions: ['RB', 'FLEX'] }
    expect(positionFilter('RB')(p as any)).toBe(true)
  })
})
