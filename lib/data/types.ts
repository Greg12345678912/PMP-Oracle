export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'FLEX'

export interface Player {
  id: string
  name: string
  firstName: string
  lastName: string
  team: string            // e.g. "ATL"
  position: Exclude<Position, 'FLEX'>  // actual position, never FLEX
  headshotUrl: string
  searchRank: number
  byeWeek: number | null
}

export interface Tier {
  id: string              // uuid, stable across renames
  label: string           // user-editable, default "S"/"A"/etc.
  playerIds: string[]
}

export interface TierState {
  tiers: Tier[]
  pool: string[]          // player IDs not yet ranked
  position: Position
}

export const DEFAULT_TIER_LABELS = ['S', 'A', 'B', 'C', 'D', 'E'] as const

export const POSITION_PLAYER_LIMITS: Record<Position, number> = {
  QB: 30,
  RB: 80,
  WR: 80,
  TE: 40,
  FLEX: 100,
}

export const FLEX_POSITIONS: Array<Exclude<Position, 'FLEX'>> = ['RB', 'WR', 'TE']
