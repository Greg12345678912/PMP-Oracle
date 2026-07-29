import type { Player, Position } from './types'

export interface DataProvider {
  getPlayers(position: Position): Promise<Player[]>
  getDraftPlayers(scoring: 'ppr' | 'half_ppr' | 'standard'): Promise<Player[]>
}
