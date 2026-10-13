/**
 * One-time repair: rebuild ground_truth for week 5, re-score all users, re-rank.
 * Skips email (already sent, dedup would block anyway).
 * Run: npx tsx --env-file .env.local scripts/repair-week5.ts
 */
import { buildGroundTruth } from '../lib/oracle/pipeline/ground-truth'
import { runScoringForSeason } from '../lib/oracle/pipeline/scoring-runner'
import { rankSeason } from '../lib/oracle/pipeline/ranker'
import { randomUUID } from 'crypto'

const SEASON_ID = 'e9929112-9137-4393-b983-3b52624712a2'
const WEEK = 5

async function main() {
  console.log(`\n=== Oracle Week ${WEEK} Repair ===\n`)

  // Stage 1: Rebuild ground truth
  console.log('Stage 1: Building ground truth (weeks 1-5)...')
  const gtResults = await buildGroundTruth(SEASON_ID, WEEK)
  for (const r of gtResults) {
    const top3 = r.topPlayers.slice(0, 3).map(p => `#${p.rank} ${p.pprPoints}pts`).join(', ')
    console.log(`  ${r.position}: ${top3}`)
  }

  if (gtResults.length < 4) {
    console.error('ERROR: Ground truth missing positions — aborting')
    process.exit(1)
  }
  console.log(`  Ground truth rebuilt for ${gtResults.length} positions\n`)

  // Stage 2: Re-score all users
  console.log('Stage 2: Re-scoring all users...')
  const pipelineRunId = randomUUID()
  const scoringResult = await runScoringForSeason(SEASON_ID, gtResults, {
    pipelineRunId,
    dryRun: false,
  })
  console.log(`  Scored: ${scoringResult.scored}, Failed: ${scoringResult.failed}`)
  if (scoringResult.errors.length > 0) {
    console.error('  Scoring errors:', scoringResult.errors)
  }

  // Stage 3: Re-rank
  console.log('\nStage 3: Re-ranking...')
  const rankResult = await rankSeason(SEASON_ID, WEEK, { dryRun: false })
  console.log(`  Ranked: ${rankResult.ranked}`)
  if (rankResult.errors.length > 0) {
    console.error('  Ranking errors:', rankResult.errors)
  }

  console.log('\n=== Repair complete ===\n')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
