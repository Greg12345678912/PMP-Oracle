/**
 * Assigns global_rank to all accuracy_scores for a season.
 * Tiebreaker chain (per spec):
 *   1. overall_score DESC
 *   2. top10_hits DESC
 *   3. total_rank_error ASC
 *   4. oracle_entries.entry_number ASC (first submitted = higher rank on tie)
 *
 * Also computes rank_change = prev_rank - new_rank (positive = moved up).
 * Idempotent — re-running same week produces same result.
 */
import { getServiceClient } from '@/lib/league/db'

export interface RankResult {
  ranked: number
  errors: string[]
}

interface AccuracyRow {
  user_id: string
  overall_score: number | null
  top10_hits: number | null
  total_rank_error: number | null
  global_rank: number | null
  prev_rank: number | null
  current_week: number | null
}

interface EntryRow {
  user_id: string
  entry_number: number
}

export async function rankSeason(
  seasonId: string,
  currentWeek: number,
  opts: { dryRun: boolean },
): Promise<RankResult> {
  const db = getServiceClient()

  // Fetch current accuracy scores and entry numbers in parallel
  const [scoresResult, entriesResult] = await Promise.all([
    db
      .from('accuracy_scores')
      .select('user_id, overall_score, top10_hits, total_rank_error, global_rank, prev_rank, current_week')
      .eq('season_id', seasonId),
    db
      .from('oracle_entries')
      .select('user_id, entry_number')
      .eq('season_id', seasonId),
  ])

  if (scoresResult.error) throw new Error(`accuracy_scores fetch failed: ${scoresResult.error.message}`)
  if (entriesResult.error) throw new Error(`oracle_entries fetch failed: ${entriesResult.error.message}`)

  const scores = (scoresResult.data ?? []) as AccuracyRow[]
  const entryNumberMap = new Map(
    ((entriesResult.data ?? []) as EntryRow[]).map(e => [e.user_id, e.entry_number]),
  )

  // Apply tiebreaker sort
  const sorted = [...scores].sort((a, b) => {
    const scoreA = a.overall_score ?? 0
    const scoreB = b.overall_score ?? 0
    if (scoreB !== scoreA) return scoreB - scoreA

    const hitsA = a.top10_hits ?? 0
    const hitsB = b.top10_hits ?? 0
    if (hitsB !== hitsA) return hitsB - hitsA

    const errA = a.total_rank_error ?? 0
    const errB = b.total_rank_error ?? 0
    if (errA !== errB) return errA - errB

    const entryA = entryNumberMap.get(a.user_id) ?? Number.MAX_SAFE_INTEGER
    const entryB = entryNumberMap.get(b.user_id) ?? Number.MAX_SAFE_INTEGER
    return entryA - entryB
  })

  if (opts.dryRun) {
    return { ranked: sorted.length, errors: [] }
  }

  const errors: string[] = []
  let ranked = 0

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]
    const newRank = i + 1
    // On a re-run of the same week, global_rank already holds this week's rank
    // (written by the first run). Using it as prevRank would produce rank_change=0
    // for everyone. Instead, use the stored prev_rank (which the first run set
    // correctly from last week's global_rank) whenever current_week matches.
    const prevRank = row.current_week === currentWeek
      ? (row.prev_rank ?? row.global_rank)
      : row.global_rank
    const rankChange = prevRank != null ? prevRank - newRank : null

    const { error } = await db
      .from('accuracy_scores')
      .update({
        global_rank: newRank,
        prev_rank: prevRank,
        rank_change: rankChange,
        current_week: currentWeek,
      })
      .eq('user_id', row.user_id)
      .eq('season_id', seasonId)

    if (error) {
      errors.push(error.message)
    } else {
      ranked++
    }
  }

  return { ranked, errors }
}
