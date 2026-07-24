import { describe, it, expect } from 'vitest'
import { getTeamColor } from '@/lib/team-colors'

describe('getTeamColor', () => {
  it('returns correct color for known team', () => {
    expect(getTeamColor('ATL')).toBe('#A71930')
    expect(getTeamColor('KC')).toBe('#E31837')
    expect(getTeamColor('SF')).toBe('#AA0000')
  })

  it('returns default gray for unknown team', () => {
    expect(getTeamColor('XYZ')).toBe('#3A3A3A')
  })

  it('is case-insensitive', () => {
    expect(getTeamColor('atl')).toBe('#A71930')
  })
})
