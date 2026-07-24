import type { DataProvider } from './provider'
import type { Player, Position } from './types'
import { POSITION_PLAYER_LIMITS, FLEX_POSITIONS } from './types'
import { getCached, setCached } from './cache'

const SLEEPER_API = 'https://api.sleeper.app/v1/players/nfl'
const HEADSHOT_BASE = 'https://sleepercdn.com/content/nfl/players/thumb'

interface SleeperPlayer {
  player_id: string
  full_name: string
  first_name: string
  last_name: string
  team: string
  position: string
  fantasy_positions: string[]
  status: string
  search_rank: number | null
}

function toPlayer(raw: SleeperPlayer): Player {
  return {
    id: raw.player_id,
    name: raw.full_name,
    firstName: raw.first_name,
    lastName: raw.last_name,
    team: raw.team ?? 'FA',
    position: raw.position as Player['position'],
    headshotUrl: `${HEADSHOT_BASE}/${raw.player_id}.jpg`,
    searchRank: raw.search_rank ?? 9999,
  }
}

export class SleeperProvider implements DataProvider {
  private allPlayersCache: Map<string, SleeperPlayer> | null = null

  private async fetchAll(): Promise<Map<string, SleeperPlayer>> {
    if (this.allPlayersCache) return this.allPlayersCache
    const res = await fetch(SLEEPER_API, { next: { revalidate: 3600 } } as RequestInit)
    if (!res.ok) throw new Error(`Sleeper API error: ${res.status}`)
    const data: Record<string, SleeperPlayer> = await res.json()
    this.allPlayersCache = new Map(Object.entries(data))
    return this.allPlayersCache
  }

  async getPlayers(position: Position): Promise<Player[]> {
    const cached = getCached(position)
    if (cached) return cached

    const all = await this.fetchAll()
    const targetPositions: string[] = position === 'FLEX'
      ? FLEX_POSITIONS
      : [position]

    const limit = POSITION_PLAYER_LIMITS[position]

    const players = Array.from(all.values())
      .filter(p =>
        p.status === 'Active' &&
        p.search_rank !== null &&
        targetPositions.includes(p.position) &&
        p.fantasy_positions?.some(fp => targetPositions.includes(fp))
      )
      .sort((a, b) => (a.search_rank ?? 9999) - (b.search_rank ?? 9999))
      .slice(0, limit)
      .map(toPlayer)

    setCached(position, players)
    return players
  }
}

export const sleeperProvider = new SleeperProvider()
