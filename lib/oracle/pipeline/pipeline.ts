/**
 * Weekly Oracle pipeline orchestrator.
 *
 * Stages (all idempotent):
 *   1. Sync NFL state → league_state (current week from Sleeper)
 *   2. Sync player stats for current week → player_stats
 *   3. Build ground truth (cumulative PPR top 10 per position) → ground_truth
 *   4. Score all submitted entries → accuracy_scores + ranking_score_detail
 *   5. Rank all entries → global_rank + movement on accuracy_scores
 *
 * dryRun=true: full logic, zero DB writes, sync_jobs NOT written.
 * week override: skip Sleeper state sync, use provided week number.
 */
import { getServiceClient } from '@/lib/league/db'
import { getCurrentSeason } from '@/lib/oracle/season'
import { syncWeeklyStats } from './stats-sync'
import { buildGroundTruth } from './ground-truth'
import { runScoringForSeason } from './scoring-runner'
import { rankSeason } from './ranker'
import { randomUUID } from 'crypto'

const SLEEPER_STATE_URL = 'https://api.sleeper.app/v1/state/nfl'
const RETRY_DELAYS = [500, 1000, 2000]

export interface PipelineResult {
  pipelineRunId: string
  seasonId: string
  seasonYear: number
  week: number
  statsUpserted: number
  statsSkipped: number
  groundTruthPositions: number
  usersScored: number
  usersFailed: number
  usersRanked: number
  dryRun: boolean
  errors: string[]
  completedAt: string
}

interface SleeperNFLState {
  season: string
  week: number
  season_type: string
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

export async function runWeeklyPipeline(opts?: {
  week?: number
  dryRun?: boolean
}): Promise<PipelineResult> {
  const db = getServiceClient()
  const dryRun = opts?.dryRun ?? false
  const pipelineRunId = randomUUID()
  const errors: string[] = []

  const season = await getCurrentSeason()
  if (!season) throw new Error('No active season found')

  // ── Concurrent-run lock ──────────────────────────────────────────────────────
  // Reject if another pipeline run started within the last 10 minutes and is
  // still marked 'running'. The 10-minute window prevents a crashed run (which
  // never updated its status to 'failed') from permanently locking the pipeline.
  if (!dryRun) {
    const lockWindowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { data: activeJobs } = await db
      .from('sync_jobs')
      .select('id, started_at')
      .eq('resource', 'oracle_pipeline')
      .eq('status', 'running')
      .gte('started_at', lockWindowStart)
      .limit(1)

    if ((activeJobs ?? []).length > 0) {
      throw new Error(
        `Pipeline already running (started ${(activeJobs![0] as { started_at: string }).started_at}). Concurrent invocation rejected.`,
      )
    }
  }

  // ── Stage 1: Determine current week ─────────────────────────────────────────
  let currentWeek = opts?.week ?? 0

  if (opts?.week == null) {
    const stateRes = await fetchWithRetry(SLEEPER_STATE_URL)
    const state: SleeperNFLState = await stateRes.json()
    currentWeek = state.week

    if (!dryRun) {
      await db.from('league_state').upsert(
        {
          season_id: season.id,
          current_week: currentWeek,
          nfl_season: state.season,
          nfl_week: state.week,
          nfl_season_type: state.season_type,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: 'season_id' },
      )
    }
  }

  // Record pipeline start in sync_jobs
  let jobId: string | null = null
  if (!dryRun) {
    const { data: jobRow } = await db
      .from('sync_jobs')
      .insert({
        resource: 'oracle_pipeline',
        provider: 'sleeper',
        status: 'running',
        started_at: new Date().toISOString(),
        pipeline_run_id: pipelineRunId,
        metadata: { week: currentWeek, dryRun },
      })
      .select('id')
      .single()
    jobId = (jobRow as { id: string } | null)?.id ?? null
  }

  // ── Stage 2: Sync weekly stats ───────────────────────────────────────────────
  let statsUpserted = 0
  let statsSkipped = 0
  let statsSyncFailed = false

  try {
    const statsResult = await syncWeeklyStats(season.id, season.year, currentWeek, { dryRun })
    statsUpserted = statsResult.upserted
    statsSkipped = statsResult.skipped
    if (statsResult.errors.length > 0) {
      // At least one DB upsert batch failed — stats are incomplete.
      // Treating partial stats as valid would produce wrong ground truth.
      errors.push(...statsResult.errors)
      statsSyncFailed = true
    }
  } catch (err) {
    errors.push(`stats-sync: ${err instanceof Error ? err.message : String(err)}`)
    statsSyncFailed = true
  }

  // SAFETY ABORT: if stats sync failed in any way, stop here.
  // Proceeding would score every user against stale/incomplete ground truth and
  // publish wrong leaderboard results with no visible error to users.
  if (statsSyncFailed && !dryRun) {
    if (jobId) {
      await db.from('sync_jobs').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        records_processed: 0,
        error: errors[0] ?? 'stats-sync failed',
      }).eq('id', jobId)
    }
    return {
      pipelineRunId,
      seasonId: season.id,
      seasonYear: season.year,
      week: currentWeek,
      statsUpserted,
      statsSkipped,
      groundTruthPositions: 0,
      usersScored: 0,
      usersFailed: 0,
      usersRanked: 0,
      dryRun,
      errors,
      completedAt: new Date().toISOString(),
    }
  }

  // ── Stage 3: Build ground truth ──────────────────────────────────────────────
  let groundTruthResults: Awaited<ReturnType<typeof buildGroundTruth>> = []
  let groundTruthFailed = false
  try {
    groundTruthResults = await buildGroundTruth(season.id, currentWeek, { dryRun })
  } catch (err) {
    errors.push(`ground-truth: ${err instanceof Error ? err.message : String(err)}`)
    groundTruthFailed = true
  }

  // ── Stage 4: Score all submitted entries ─────────────────────────────────────
  // SAFETY: if ground truth failed or produced no results, skip scoring entirely.
  // Running scoreUser with empty ground truth would upsert overall_score=0 for
  // every user, silently wiping all valid scores from previous pipeline runs.
  let usersScored = 0
  let usersFailed = 0
  if (groundTruthFailed || groundTruthResults.length === 0) {
    errors.push('scoring-runner: skipped — ground truth unavailable, preserving existing scores')
  } else {
    try {
      const scoringResult = await runScoringForSeason(season.id, groundTruthResults, {
        pipelineRunId,
        dryRun,
      })
      usersScored = scoringResult.scored
      usersFailed = scoringResult.failed
      errors.push(...scoringResult.errors)
    } catch (err) {
      errors.push(`scoring-runner: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Stage 5: Rank entries ────────────────────────────────────────────────────
  // Skip ranking if scoring was skipped — ranks are still valid from last run.
  let usersRanked = 0
  if (!groundTruthFailed && groundTruthResults.length > 0) {
    try {
      const rankResult = await rankSeason(season.id, currentWeek, { dryRun })
      usersRanked = rankResult.ranked
      errors.push(...rankResult.errors)
    } catch (err) {
      errors.push(`ranker: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const completedAt = new Date().toISOString()

  // Finish sync_jobs record
  if (!dryRun && jobId) {
    await db.from('sync_jobs').update({
      status: errors.length > 0 ? 'failed' : 'success',
      completed_at: completedAt,
      records_processed: usersScored,
      error: errors[0] ?? null,
    }).eq('id', jobId)
  }

  return {
    pipelineRunId,
    seasonId: season.id,
    seasonYear: season.year,
    week: currentWeek,
    statsUpserted,
    statsSkipped,
    groundTruthPositions: groundTruthResults.length,
    usersScored,
    usersFailed,
    usersRanked,
    dryRun,
    errors,
    completedAt,
  }
}
