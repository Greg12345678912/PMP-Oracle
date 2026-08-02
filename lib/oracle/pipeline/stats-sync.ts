/**
 * Syncs weekly player stats from Sleeper into player_stats table.
 * Idempotent — safe to call multiple times for the same week.
 */
import { getServiceClient } from '@/lib/league/db'

const SLEEPER_STATS_BASE = 'https://api.sleeper.app/v1/stats/nfl/regular'
const SYNC_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE'])
const RETRY_DELAYS = [500, 1000, 2000]

export interface StatsSyncResult {
  upserted: number
  skipped: number
  errors: string[]
}

interface SleeperStatsResponse {
  [playerId: string]: {
    pts_ppr?: number
    gp?: number
    [key: string]: unknown
  }
}

interface SleeperPlayerInfo {
  position?: string
  full_name?: string
  team?: string
}

async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const res = await fetch(url)
      if (res.ok) return res
      throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < RETRY_DELAYS.length) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]))
      }
    }
  }
  throw lastError ?? new Error('fetch failed')
}

/**
 * Sync player stats for a single NFL week.
 * Pulls pts_ppr from Sleeper and upserts into player_stats.
 * Player position/name info is joined from player_cache.
 */
export async function syncWeeklyStats(
  seasonId: string,
  seasonYear: number,
  week: number,
  opts?: { dryRun?: boolean },
): Promise<StatsSyncResult> {
  const db = getServiceClient()
  const dryRun = opts?.dryRun ?? false

  // Fetch Sleeper weekly stats + player info in parallel
  const [statsRes, playersRes] = await Promise.all([
    fetchWithRetry(`${SLEEPER_STATS_BASE}/${seasonYear}/${week}`),
    fetchWithRetry('https://api.sleeper.app/v1/players/nfl'),
  ])

  const stats: SleeperStatsResponse = await statsRes.json()
  const players: Record<string, SleeperPlayerInfo> = await playersRes.json()

  const now = new Date().toISOString()
  const rows: Record<string, unknown>[] = []
  let skipped = 0

  for (const [playerId, statRow] of Object.entries(stats)) {
    const ptsRaw = statRow.pts_ppr
    if (ptsRaw == null || ptsRaw === 0) { skipped++; continue }

    const playerInfo = players[playerId]
    if (!playerInfo) { skipped++; continue }

    const position = playerInfo.position ?? ''
    if (!SYNC_POSITIONS.has(position)) { skipped++; continue }

    rows.push({
      season_id: seasonId,
      week,
      player_id: playerId,
      player_name: playerInfo.full_name ?? playerId,
      position,
      team: playerInfo.team ?? null,
      game_id: null,
      provider: 'sleeper',
      external_id: playerId,
      ppr_points: ptsRaw,
      last_synced_at: now,
    })
  }

  if (dryRun) {
    return { upserted: rows.length, skipped, errors: [] }
  }

  const BATCH = 100
  const errors: string[] = []
  let upserted = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db
      .from('player_stats')
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'season_id,week,player_id' })
    if (error) {
      errors.push(error.message)
    } else {
      upserted += Math.min(BATCH, rows.length - i)
    }
  }

  return { upserted, skipped, errors }
}
