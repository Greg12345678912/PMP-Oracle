/**
 * Syncs Sleeper + FantasyCalc data into player_cache.
 * Called by the /api/sync/players cron route — never called at request time.
 */
import { getServiceClient } from '@/lib/league/db'
import { EXCLUDED_PLAYER_IDS, ALWAYS_INCLUDE_IDS } from './sleeper'
import type { SleeperPlayer } from './sleeper'

const SLEEPER_API = 'https://api.sleeper.app/v1/players/nfl'
const HEADSHOT_BASE = 'https://sleepercdn.com/content/nfl/players/thumb'
const FC_FALLBACK_OFFSET = 300

// Positions we care about for Oracle + future features
const SYNC_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])

interface FantasyCalcEntry {
  player: { sleeperId?: string | number; name: string; position: string }
  overallRank: number
}

async function fetchFantasyCalcRanks(scoring: 'ppr' | 'half_ppr' | 'standard'): Promise<Map<string, number>> {
  const ppr = scoring === 'ppr' ? 1 : scoring === 'half_ppr' ? 0.5 : 0
  const url = `https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=1&ppr=${ppr}&numTeams=12`
  try {
    const res = await fetch(url)
    if (!res.ok) return new Map()
    const data: FantasyCalcEntry[] = await res.json()
    const map = new Map<string, number>()
    for (const entry of data) {
      if (entry.player.sleeperId != null) {
        map.set(String(entry.player.sleeperId), entry.overallRank)
      }
    }
    return map
  } catch {
    return new Map()
  }
}

export interface SyncResult {
  upserted: number
  skipped: number
  errors: string[]
}

/**
 * Full sync: Sleeper roster + FantasyCalc ADP → player_cache.
 * Idempotent — safe to call repeatedly.
 */
export async function syncPlayersToCache(scoring: 'ppr' | 'half_ppr' | 'standard' = 'ppr'): Promise<SyncResult> {
  // Fetch Sleeper + FantasyCalc in parallel
  const [sleeperRes, fcMap] = await Promise.all([
    fetch(SLEEPER_API),
    fetchFantasyCalcRanks(scoring),
  ])

  if (!sleeperRes.ok) throw new Error(`Sleeper API error: ${sleeperRes.status}`)
  const raw: Record<string, SleeperPlayer> = await sleeperRes.json()

  const now = new Date().toISOString()
  const rows: Record<string, unknown>[] = []
  let skipped = 0

  for (const p of Object.values(raw)) {
    // Filter to relevant positions only
    if (!SYNC_POSITIONS.has(p.position)) { skipped++; continue }
    // Skip explicitly excluded players
    if (EXCLUDED_PLAYER_IDS.has(p.player_id)) { skipped++; continue }
    // Skip players without a name
    if (!p.full_name) { skipped++; continue }
    // Skip inactive players unless always-include
    const alwaysInclude = ALWAYS_INCLUDE_IDS.has(p.player_id)
    if (p.status !== 'Active' && !alwaysInclude) { skipped++; continue }
    // Skip unranked players unless always-include
    if (p.search_rank == null && !alwaysInclude) { skipped++; continue }

    const fcRank = fcMap.get(p.player_id)
    const adpValue = fcRank != null
      ? fcRank
      : alwaysInclude
        ? FC_FALLBACK_OFFSET + (p.search_rank ?? 9999)
        : null

    rows.push({
      id: p.player_id,
      sport: 'nfl',
      provider: 'sleeper',
      provider_id: p.player_id,
      first_name: p.first_name ?? null,
      last_name: p.last_name ?? null,
      full_name: p.full_name,
      position: p.position ?? null,
      team: p.team ?? null,
      status: p.status ?? null,
      bye_week: p.bye_week ?? null,
      headshot_url: `${HEADSHOT_BASE}/${p.player_id}.jpg`,
      search_rank: p.search_rank ?? null,
      adp_value: adpValue,
      adp_format: adpValue != null ? scoring : null,
      last_synced_at: now,
      updated_at: now,
    })
  }

  // Upsert in batches of 100
  const db = getServiceClient()
  const BATCH = 100
  const errors: string[] = []
  let upserted = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db
      .from('player_cache')
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'id' })
    if (error) {
      errors.push(error.message)
    } else {
      upserted += Math.min(BATCH, rows.length - i)
    }
  }

  return { upserted, skipped, errors }
}
