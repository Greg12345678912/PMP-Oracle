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
import { getCurrentSeason, isLocked } from '@/lib/oracle/season'
import { ORACLE_POSITIONS } from '@/lib/oracle/constants'
import { syncWeeklyStats } from './stats-sync'
import { buildGroundTruth } from './ground-truth'
import { runScoringForSeason } from './scoring-runner'
import { rankSeason } from './ranker'
import { randomUUID } from 'crypto'

/**
 * Fire-and-forget webhook alert for situations that require manual intervention.
 * Failures are swallowed so the pipeline result is never affected by alert delivery.
 */
async function sendOracleAlert(message: string): Promise<void> {
  const url = process.env.ORACLE_ALERT_WEBHOOK_URL
  if (!url) return
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `[Oracle Pipeline] ${message}` }),
    })
  } catch (err) {
    // Alert failure must never surface as a pipeline error
    console.error('[oracle/alert] Discord webhook failed:', err instanceof Error ? err.message : String(err))
  }
}

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

  let season = await getCurrentSeason()
  if (!season) throw new Error('No active season found')

  // ── Playoff guard ────────────────────────────────────────────────────────────
  // Once a season is finalized (status = 'scored'), skip all data modifications.
  // Without this, the cron job would continue syncing playoff stats and rewriting
  // accuracy_scores / global_rank every Tuesday through the Super Bowl.
  if (!dryRun && season.status === 'scored') {
    return {
      pipelineRunId,
      seasonId: season.id,
      seasonYear: season.year,
      week: 0,
      statsUpserted: 0,
      statsSkipped: 0,
      groundTruthPositions: 0,
      usersScored: 0,
      usersFailed: 0,
      usersRanked: 0,
      dryRun,
      errors: ['Season is finalized — pipeline is a no-op to protect standings.'],
      completedAt: new Date().toISOString(),
    }
  }

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

    if (state.season_type !== 'regular') {
      throw new Error(
        `NFL is in ${state.season_type} (Sleeper week ${state.week}) — Oracle pipeline only runs during the regular season. ` +
          `Use opts.week = 0 to trigger the Oracle Week 0 dry run manually (Sept 7).`,
      )
    }

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
    // Partial ground truth is as dangerous as none — scoring a user against
    // only 2 of 4 positions would zero out the missing positions' scores.
    const missingPositions = ORACLE_POSITIONS.filter(
      pos => !groundTruthResults.some(r => r.position === pos),
    )
    if (missingPositions.length > 0) {
      errors.push(`ground-truth: missing positions [${missingPositions.join(', ')}] — scoring skipped to preserve existing scores`)
      groundTruthFailed = true
    }
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

  // ── Pipeline completion alerts ───────────────────────────────────────────────
  if (!dryRun) {
    if (errors.length === 0 && usersFailed === 0) {
      void sendOracleAlert(
        `✅ Week ${currentWeek} pipeline complete — ${usersScored} users scored, 0 failed`,
      )
    } else {
      void sendOracleAlert(
        `❌ Week ${currentWeek} pipeline finished with issues — ${usersScored} scored, ${usersFailed} failed, ${errors.length} error(s): ${errors[0] ?? 'unknown'}`,
      )
    }
  }

  // ── Stage 6 pre-check: Auto-transition 'open' → 'locked' ─────────────────────
  // Nothing else writes 'locked' status — the pipeline is the right place to
  // handle this. If lock_at has passed and we're still 'open', flip to 'locked'
  // so Stage 6a can fire correctly and the status reflects reality.
  if (!dryRun && season.status === 'open' && isLocked(season)) {
    try {
      await db.from('seasons').update({ status: 'locked' }).eq('id', season.id)
      season = { ...season, status: 'locked' }
    } catch {
      // Non-fatal — Stage 6a will be skipped this run but the next run will retry
    }
  }

  // ── Stage 6a: Transition to 'scoring' after first successful scoring run ─────
  // Flips status from 'locked' → 'scoring' so the app shows live community stats.
  // Only fires once — idempotent guard on season.status === 'locked'.
  if (
    !dryRun &&
    usersScored > 0 &&
    usersFailed === 0 &&
    season.status === 'locked'
  ) {
    try {
      await db
        .from('seasons')
        .update({ status: 'scoring' })
        .eq('id', season.id)
    } catch (err) {
      errors.push(`stage-6a: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Stage 6b: Finalize season after a clean Week 18 run ─────────────────────
  // Automatically sets status = 'scored' so no manual DB intervention is needed.
  // Guard: only triggers when the full regular season (week 18+) has completed
  // successfully — no pipeline errors and every submitted entry scored. Idempotent.
  const FINAL_WEEK = 18
  if (!dryRun && currentWeek >= FINAL_WEEK) {
    if (errors.length === 0 && usersFailed === 0 && season.status !== 'scored') {
      try {
        await db
          .from('seasons')
          .update({ status: 'scored', scored_at: completedAt })
          .eq('id', season.id)
      } catch (err) {
        errors.push(`stage-6b: ${err instanceof Error ? err.message : String(err)}`)
        void sendOracleAlert(
          `Week ${currentWeek} run completed but season finalization FAILED: ${err instanceof Error ? err.message : String(err)}. Manual intervention required — run UPDATE seasons SET status='scored', scored_at=now() WHERE id='${season.id}'.`,
        )
      }
    } else if (season.status !== 'scored') {
      // Week 18 run had errors or failed users — season was not finalized.
      // Alert so we can manually trigger a clean re-run or force finalization.
      void sendOracleAlert(
        `Week ${currentWeek} run completed with ${errors.length} error(s) and ${usersFailed} failed user(s). Season NOT finalized. Review pipeline logs and re-run or manually set status='scored' for season ${season.id}.`,
      )
    }
  }

  // Finish sync_jobs record
  if (!dryRun && jobId) {
    try {
      await db.from('sync_jobs').update({
        status: errors.length > 0 ? 'failed' : 'success',
        completed_at: completedAt,
        records_processed: usersScored,
        error: errors[0] ?? null,
      }).eq('id', jobId)
    } catch {
      // sync_jobs failure is non-critical — the pipeline result is still valid
    }
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
