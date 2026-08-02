/**
 * Scores all submitted entries for a season.
 * Fetches submitted user IDs, then scores in parallel batches of 100.
 * Idempotent — upserts overwrite previous scores.
 */
import { getServiceClient } from '@/lib/league/db'
import { scoreUser } from '@/lib/oracle/scoring'
import { groundTruthToRecord } from './ground-truth'
import type { GroundTruthResult } from './ground-truth'

const BATCH_SIZE = 100

export interface ScoringRunResult {
  scored: number
  failed: number
  errors: string[]
}

export async function runScoringForSeason(
  seasonId: string,
  groundTruthResults: GroundTruthResult[],
  opts: { pipelineRunId: string; dryRun: boolean },
): Promise<ScoringRunResult> {
  const db = getServiceClient()
  const groundTruth = groundTruthToRecord(groundTruthResults)

  // Collect all distinct submitted user IDs
  const { data: submittedRows, error } = await db
    .from('challenge_rankings')
    .select('user_id')
    .eq('season_id', seasonId)
    .eq('is_submitted', true)

  if (error) throw new Error(`Failed to fetch submitted users: ${error.message}`)

  const userIds = [...new Set((submittedRows ?? []).map(r => r.user_id as string))]

  let scored = 0
  let failed = 0
  const errors: string[] = []

  // Score in parallel batches of BATCH_SIZE
  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(userId =>
        scoreUser(userId, seasonId, groundTruth, {
          pipelineRunId: opts.pipelineRunId,
          dryRun: opts.dryRun,
        }),
      ),
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        scored++
      } else {
        failed++
        const msg = result.reason instanceof Error ? result.reason.message : String(result.reason)
        errors.push(msg)
      }
    }
  }

  return { scored, failed, errors }
}
