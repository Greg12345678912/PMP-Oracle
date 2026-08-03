/**
 * DB-backed DataProvider. Reads from player_cache (Supabase).
 * Falls back to live Sleeper only if the DB is empty (first-run / unseeded).
 */
import { getServiceClient } from '@/lib/league/db'
import { SleeperProvider } from './sleeper'
import type { DataProvider } from './provider'
import type { Player, Position } from './types'
import { POSITION_PLAYER_LIMITS, FLEX_POSITIONS } from './types'

interface PlayerCacheRow {
  id: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  position: string | null
  team: string | null
  headshot_url: string | null
  search_rank: number | null
  bye_week: number | null
  adp_value: number | null
}

function toPlayer(row: PlayerCacheRow): Player {
  return {
    id: row.id,
    name: row.full_name ?? '',
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    team: row.team ?? 'FA',
    position: row.position as Player['position'],
    headshotUrl: row.headshot_url ?? `https://sleepercdn.com/content/nfl/players/thumb/${row.id}.jpg`,
    searchRank: row.adp_value != null ? Math.round(row.adp_value) : (row.search_rank ?? 9999),
    byeWeek: row.bye_week ?? null,
  }
}

const SELECT_COLS = 'id, full_name, first_name, last_name, position, team, headshot_url, search_rank, bye_week, adp_value'

export class DBProvider implements DataProvider {
  async getPlayers(position: Position): Promise<Player[]> {
    const targetPositions = position === 'FLEX' ? FLEX_POSITIONS : [position]
    const limit = POSITION_PLAYER_LIMITS[position]

    const db = getServiceClient()
    const { data, error } = await db
      .from('player_cache')
      .select(SELECT_COLS)
      .eq('sport', 'nfl')
      .in('position', targetPositions)
      .order('search_rank', { ascending: true, nullsFirst: false })
      .limit(limit)

    if (error || !data || data.length === 0) {
      return new SleeperProvider().getPlayers(position)
    }

    return (data as PlayerCacheRow[]).map(toPlayer)
  }

  async getDraftPlayers(scoring: 'ppr' | 'half_ppr' | 'standard'): Promise<Player[]> {
    const db = getServiceClient()
    const { data, error } = await db
      .from('player_cache')
      .select(SELECT_COLS)
      .eq('sport', 'nfl')
      .in('position', ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
      .not('adp_value', 'is', null)
      .eq('adp_format', scoring)
      .order('adp_value', { ascending: true, nullsFirst: false })
      .limit(500)

    if (error || !data || data.length === 0) {
      return new SleeperProvider().getDraftPlayers(scoring)
    }

    return (data as PlayerCacheRow[]).map(toPlayer)
  }
}
