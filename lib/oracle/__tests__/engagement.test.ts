import { describe, it, expect } from 'vitest'
import { getLastPlaceCurse } from '../curses'

describe('getLastPlaceCurse', () => {
  it('returns a non-empty string for week 0', () => {
    expect(getLastPlaceCurse(0)).toBeTruthy()
    expect(typeof getLastPlaceCurse(0)).toBe('string')
  })

  it('returns a non-empty string for week 1', () => {
    expect(getLastPlaceCurse(1)).toBeTruthy()
  })

  it('returns a non-empty string for week 2 (current season)', () => {
    expect(getLastPlaceCurse(2)).toBeTruthy()
  })

  it('rotates to a different title each week', () => {
    const titles = Array.from({ length: 5 }, (_, i) => getLastPlaceCurse(i))
    // At least some weeks should produce different titles
    const unique = new Set(titles)
    expect(unique.size).toBeGreaterThan(1)
  })

  it('wraps around deterministically after all titles are used', () => {
    // 12 titles — week 0 and week 12 should match
    expect(getLastPlaceCurse(0)).toEqual(getLastPlaceCurse(12))
    expect(getLastPlaceCurse(1)).toEqual(getLastPlaceCurse(13))
    expect(getLastPlaceCurse(5)).toEqual(getLastPlaceCurse(17))
  })

  it('handles large week numbers without throwing', () => {
    expect(() => getLastPlaceCurse(100)).not.toThrow()
    expect(getLastPlaceCurse(100)).toBeTruthy()
  })
})
