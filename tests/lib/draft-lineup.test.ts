import { describe, it, expect } from 'vitest'
import { buildRosterSlots } from '@/lib/draft/lineup'
import { DEFAULT_LINEUP } from '@/lib/draft/types'

describe('buildRosterSlots', () => {
  it('builds 15 slots from DEFAULT_LINEUP', () => {
    const slots = buildRosterSlots(DEFAULT_LINEUP)
    expect(slots).toHaveLength(15)
  })

  it('first slot is QB', () => {
    const slots = buildRosterSlots(DEFAULT_LINEUP)
    expect(slots[0].label).toBe('QB')
    expect(slots[0].positions).toEqual(['QB'])
  })

  it('FLEX slot accepts RB WR TE', () => {
    const slots = buildRosterSlots(DEFAULT_LINEUP)
    const flex = slots.find(s => s.label === 'FLEX')
    expect(flex?.positions).toEqual(['RB', 'WR', 'TE'])
  })

  it('handles custom lineup', () => {
    const custom = { ...DEFAULT_LINEUP, WR: 4, BN: 5 }
    const slots = buildRosterSlots(custom)
    const wrSlots = slots.filter(s => s.label === 'WR')
    expect(wrSlots).toHaveLength(4)
  })

  it('BN slots accept any position', () => {
    const slots = buildRosterSlots(DEFAULT_LINEUP)
    const bn = slots.find(s => s.label === 'BN')
    expect(bn?.positions).toContain('QB')
    expect(bn?.positions).toContain('DEF')
  })
})
