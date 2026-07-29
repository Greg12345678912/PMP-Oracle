import type { LineupConfig } from './types'

export interface RosterSlot {
  label: string
  positions: string[]
}

export function buildRosterSlots(lineup: LineupConfig): RosterSlot[] {
  const slots: RosterSlot[] = []
  const repeat = (n: number, label: string, positions: string[]) => {
    for (let i = 0; i < n; i++) slots.push({ label, positions })
  }
  repeat(lineup.QB,   'QB',   ['QB'])
  repeat(lineup.RB,   'RB',   ['RB'])
  repeat(lineup.WR,   'WR',   ['WR'])
  repeat(lineup.TE,   'TE',   ['TE'])
  repeat(lineup.FLEX, 'FLEX', ['RB', 'WR', 'TE'])
  repeat(lineup.K,    'K',    ['K'])
  repeat(lineup.DEF,  'DEF',  ['DEF'])
  repeat(lineup.BN,   'BN',   ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
  return slots
}
