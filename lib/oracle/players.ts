import { DBProvider } from '@/lib/data/db-provider'
import type { Player } from '@/lib/data/types'
import type { OraclePosition } from './constants'

/** Filter predicate: does this player belong to the given oracle position? */
export function positionFilter(position: OraclePosition): (p: Player) => boolean {
  return (p: Player) => p.position === position
}

/** Fetch ADP-sorted player pool for a position from the database.
 *  Falls back to live Sleeper if player_cache is empty (first-run). */
export async function getPlayerPool(position: OraclePosition): Promise<Player[]> {
  const provider = new DBProvider()
  const all = await provider.getDraftPlayers('ppr')
  return all.filter(positionFilter(position))
}
