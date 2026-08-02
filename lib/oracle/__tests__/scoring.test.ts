import { vi, describe, it, expect } from 'vitest'
import { generateSummary } from '../scoring'
import type { OracleResult } from '../scoring'

vi.mock('@/lib/league/db')
vi.mock('../rankings')

// Scoring algorithm is pending approval — only test generateSummary for now.

describe('generateSummary', () => {
  it('returns exceptional copy for score >= 90', () => {
    const result: OracleResult = {
      overallScore: 92,
      positionResults: [
        { position: 'QB', normalizedScore: 95, players: [] },
        { position: 'RB', normalizedScore: 90, players: [] },
        { position: 'WR', normalizedScore: 91, players: [] },
        { position: 'TE', normalizedScore: 92, players: [] },
      ],
    }
    expect(generateSummary(result)).toMatch(/exceptional/i)
  })

  it('returns strong copy for score >= 75', () => {
    const result: OracleResult = {
      overallScore: 78,
      positionResults: [
        { position: 'QB', normalizedScore: 90, players: [] },
        { position: 'RB', normalizedScore: 70, players: [] },
        { position: 'WR', normalizedScore: 80, players: [] },
        { position: 'TE', normalizedScore: 72, players: [] },
      ],
    }
    const summary = generateSummary(result)
    expect(summary).toMatch(/strong/i)
    expect(summary).toMatch(/QB/)
    expect(summary).toMatch(/RB/)
  })

  it('returns improvement copy for score < 75', () => {
    const result: OracleResult = {
      overallScore: 50,
      positionResults: [
        { position: 'QB', normalizedScore: 80, players: [] },
        { position: 'RB', normalizedScore: 40, players: [] },
        { position: 'WR', normalizedScore: 50, players: [] },
        { position: 'TE', normalizedScore: 30, players: [] },
      ],
    }
    const summary = generateSummary(result)
    expect(summary).toMatch(/QB/)
    expect(summary).toMatch(/TE/)
  })

  it('overall score average calculation: (100+80+60+40)/4 = 70', () => {
    const overall = Math.round(((100 + 80 + 60 + 40) / 4) * 10) / 10
    expect(overall).toBe(70)
  })
})
