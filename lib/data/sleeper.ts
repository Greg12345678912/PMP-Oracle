import type { DataProvider } from './provider'
import type { Player, Position } from './types'
import { POSITION_PLAYER_LIMITS, FLEX_POSITIONS } from './types'
import { getCached, setCached } from './cache'

const SLEEPER_API = 'https://api.sleeper.app/v1/players/nfl'
const HEADSHOT_BASE = 'https://sleepercdn.com/content/nfl/players/thumb'

// Players excluded from all position pools (retired, irrelevant, etc.)
const EXCLUDED_PLAYER_IDS = new Set([
  '13269', // Fernando Mendoza
  '167',   // Tom Brady
  '13275', // Ty Simpson
  '138',   // Ben Roethlisberger
  '11559', // Michael Penix
  '11565', // J.J. McCarthy
  '2028',  // Derek Carr
  '4179',  // Joshua Dobbs
  '1837',  // Jimmy Garoppolo
  '954',   // Cam Newton
  '12524', // Shedeur Sanders
  '7527',  // Mac Jones
  '13337', // Emmett Johnson (no headshot)
  '13405', // Kaytron Allen (no headshot)
  '13347', // Demond Claiborne (no headshot)
])

// Players to always include regardless of search_rank (Sleeper doesn't rank them but they're relevant)
const ALWAYS_INCLUDE_IDS = new Set([
  '96',   // Aaron Rodgers
  '1166', // Kirk Cousins
  '4017', // Deshaun Watson
])

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
  bye_week?: number
  adp_ppr?: number | null
  adp_half_ppr?: number | null
  adp_std?: number | null
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
    byeWeek: raw.bye_week ?? null,
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

    const ranked = Array.from(all.values())
      .filter(p =>
        p.status === 'Active' &&
        p.search_rank !== null &&
        !EXCLUDED_PLAYER_IDS.has(p.player_id) &&
        targetPositions.includes(p.position) &&
        p.fantasy_positions?.some(fp => targetPositions.includes(fp))
      )
      .sort((a, b) => (a.search_rank ?? 9999) - (b.search_rank ?? 9999))
      .slice(0, limit)

    const alwaysInclude = Array.from(all.values()).filter(p =>
      ALWAYS_INCLUDE_IDS.has(p.player_id) &&
      targetPositions.includes(p.position)
    )

    const seen = new Set(ranked.map(p => p.player_id))
    const players = [
      ...ranked,
      ...alwaysInclude.filter(p => !seen.has(p.player_id)),
    ].map(toPlayer)

    setCached(position, players)
    return players
  }

  async getDraftPlayers(scoring: 'ppr' | 'half_ppr' | 'standard'): Promise<Player[]> {
    const raw = await this.fetchAll()
    const LIMITS: Partial<Record<string, number>> = {
      QB: 30, RB: 80, WR: 80, TE: 40, K: 15, DEF: 15,
    }

    const getAdp = (p: SleeperPlayer): number => {
      const adp = scoring === 'ppr' ? p.adp_ppr
        : scoring === 'half_ppr' ? p.adp_half_ppr
        : p.adp_std
      return adp != null ? adp : (p.search_rank ?? 9999)
    }

    const sorted = Array.from(raw.values())
      .filter(p => LIMITS[p.position] !== undefined && getAdp(p) < 9999)
      .sort((a, b) => getAdp(a) - getAdp(b))

    const counts: Partial<Record<string, number>> = {}
    const adpByPlayer = new Map<string, number>()
    const pool: SleeperPlayer[] = []

    for (const p of sorted) {
      const limit = LIMITS[p.position] ?? 0
      const count = counts[p.position] ?? 0
      if (count < limit) {
        adpByPlayer.set(p.player_id, getAdp(p))
        pool.push(p)
        counts[p.position] = count + 1
      }
    }

    return pool
      .sort((a, b) => (adpByPlayer.get(a.player_id) ?? 9999) - (adpByPlayer.get(b.player_id) ?? 9999))
      .map(p => ({ ...toPlayer(p), searchRank: Math.round(adpByPlayer.get(p.player_id) ?? 9999) }))
  }
}

export const sleeperProvider = new SleeperProvider()
