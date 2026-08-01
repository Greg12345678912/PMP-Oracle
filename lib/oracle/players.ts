import { SleeperProvider } from '@/lib/data/sleeper'
import type { Player } from '@/lib/data/types'
import type { OraclePosition } from './constants'

/** Filter predicate: does this player belong to the given oracle position? */
export function positionFilter(position: OraclePosition): (p: Player) => boolean {
  return (p: Player) => p.position === position
}

/** Fetch ADP-sorted player pool for a position from Sleeper.
 *  Returns top 60 for RB/WR, top 30 for QB/TE — plenty of choices. */
export async function getPlayerPool(position: OraclePosition): Promise<Player[]> {
  const provider = new SleeperProvider()
  const all = await provider.getDraftPlayers('ppr')
  return all.filter(positionFilter(position))
}
