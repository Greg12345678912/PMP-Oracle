import { describe, it, expect } from 'vitest'
import { encodeTierState, decodeTierState } from '@/lib/share/encode'
import type { Tier } from '@/lib/data/types'

const sampleTiers: Tier[] = [
  { id: 'tier-1', label: 'S', playerIds: ['123', '456'] },
  { id: 'tier-2', label: 'A', playerIds: ['789'] },
  { id: 'tier-3', label: 'B', playerIds: [] },
]

describe('encodeTierState / decodeTierState', () => {
  it('round-trips tier state', () => {
    const encoded = encodeTierState(sampleTiers)
    const decoded = decodeTierState(encoded)
    expect(decoded).toEqual(sampleTiers)
  })

  it('produces URL-safe strings (no + or /)', () => {
    const encoded = encodeTierState(sampleTiers)
    expect(encoded).not.toMatch(/[+/=]/)
  })

  it('returns null for invalid input', () => {
    expect(decodeTierState('garbage')).toBeNull()
    expect(decodeTierState('')).toBeNull()
  })

  it('stays under 2000 characters for 80-player tier state', () => {
    const bigTiers: Tier[] = [
      { id: 'tier-1', label: 'S', playerIds: Array.from({ length: 10 }, (_, i) => String(1000 + i)) },
      { id: 'tier-2', label: 'A', playerIds: Array.from({ length: 20 }, (_, i) => String(2000 + i)) },
      { id: 'tier-3', label: 'B', playerIds: Array.from({ length: 20 }, (_, i) => String(3000 + i)) },
      { id: 'tier-4', label: 'C', playerIds: Array.from({ length: 15 }, (_, i) => String(4000 + i)) },
      { id: 'tier-5', label: 'D', playerIds: Array.from({ length: 10 }, (_, i) => String(5000 + i)) },
      { id: 'tier-6', label: 'F', playerIds: Array.from({ length: 5 }, (_, i) => String(6000 + i)) },
    ]
    const encoded = encodeTierState(bigTiers)
    expect(encoded.length).toBeLessThan(2000)
  })
})
